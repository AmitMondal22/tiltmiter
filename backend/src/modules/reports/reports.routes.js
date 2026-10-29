import pkg from 'sequelize';
const { Op } = pkg;
import { TelemetryRecord, Device, Site, Project, Organization } from '../../models/index.js';
import { inMemoryTelemetryStore } from '../../config/influx.js';
import { authenticateOptional } from '../../middleware/authMiddleware.js';

export async function reportsRoutes(fastify) {
  // Project-wise, Site-wise, Device-wise Date-to-Date Analytics & Report Generation using PostgreSQL
  fastify.get('/api/reports/analytics', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const { organizationId, projectId, siteId, deviceId, fromDate, toDate } = req.query || {};

      let startDate = null;
      let stopDate = null;

      try {
        if (fromDate) {
          if (typeof fromDate === 'string' && fromDate.length === 10) {
            startDate = new Date(`${fromDate}T00:00:00+05:30`);
          } else {
            startDate = new Date(fromDate);
          }
        }
        if (toDate) {
          if (typeof toDate === 'string' && toDate.length === 10) {
            stopDate = new Date(`${toDate}T23:59:59.999+05:30`);
          } else {
            stopDate = new Date(toDate);
          }
        }
      } catch (e) {}

      // Build Device query filter
      const deviceWhere = {};
      if (siteId) deviceWhere.siteId = siteId;
      if (deviceId) deviceWhere.id = deviceId;

      const matchingDevices = await Device.findAll({
        where: deviceWhere,
        include: [{
          model: Site,
          where: projectId ? { projectId } : {},
          include: [projectId && organizationId ? { model: Project, where: { organizationId } } : Project],
        }],
      }).catch(() => []);

      const deviceIds = matchingDevices.map(d => d.id);

      // Build TelemetryRecord query filter
      const telemetryWhere = {};
      if (deviceIds.length > 0) {
        telemetryWhere.deviceId = { [Op.in]: deviceIds };
      } else if (deviceId) {
        telemetryWhere.deviceId = deviceId;
      }

      if (startDate || stopDate) {
        telemetryWhere.timestamp = {};
        if (startDate && !isNaN(startDate.getTime())) telemetryWhere.timestamp[Op.gte] = startDate;
        if (stopDate && !isNaN(stopDate.getTime())) telemetryWhere.timestamp[Op.lte] = stopDate;
      }

      // Query Time-Series Records from PostgreSQL Table
      const records = await TelemetryRecord.findAll({
        where: telemetryWhere,
        order: [['timestamp', 'ASC']],
        limit: 2000,
      });

      // Fetch all unique devices from matching records for calibration status
      const allDevIds = [...new Set(records.map(r => r.deviceId).filter(Boolean))];
      if (deviceId) allDevIds.push(deviceId, String(deviceId).toUpperCase(), String(deviceId).toLowerCase());

      const devicesFound = await Device.findAll({
        where: {
          [Op.or]: [
            { id: { [Op.in]: allDevIds.length > 0 ? allDevIds : ['__none__'] } },
            ...(deviceId ? [{ id: deviceId }, { id: String(deviceId).toUpperCase() }, { id: String(deviceId).toLowerCase() }] : [])
          ]
        }
      }).catch(() => []);

      const deviceMap = new Map();
      for (const d of devicesFound) {
        deviceMap.set(d.id, d);
        deviceMap.set(d.id.toUpperCase(), d);
        deviceMap.set(d.id.toLowerCase(), d);
      }

      // Helper to extract sensor values from rawPayload or stored JSONB columns
      const extractSensorData = (r) => {
        const raw = r.rawPayload || {};
        const ax = parseFloat(raw.acceleration?.ax ?? r.acceleration?.ax ?? null);
        const ay = parseFloat(raw.acceleration?.ay ?? r.acceleration?.ay ?? null);
        const az = parseFloat(raw.acceleration?.az ?? r.acceleration?.az ?? null);
        const axG = !isNaN(ax) ? (Math.abs(ax) > 3.0 ? ax / 9.80665 : ax) : null;
        const ayG = !isNaN(ay) ? (Math.abs(ay) > 3.0 ? ay / 9.80665 : ay) : null;
        const azG = !isNaN(az) ? (Math.abs(az) > 3.0 ? az / 9.80665 : az) : null;
        const accMag = parseFloat(raw.acceleration?.accMag ?? r.acceleration?.accMag ?? null);
        const vibRMS = parseFloat(raw.vibration?.vibrationRMS ?? raw.vibration?.vibration ?? r.vibration?.vibrationRMS ?? r.vibration?.vibration ?? null);
        const vibPeak = parseFloat(raw.vibration?.vibrationPeak ?? r.vibration?.vibrationPeak ?? null);
        const rawEnvTemp = r.temperature ?? raw.environment?.temperature;
        const temperature = (rawEnvTemp !== undefined && rawEnvTemp !== null && !isNaN(parseFloat(rawEnvTemp)))
          ? parseFloat(rawEnvTemp)
          : null;
        return {
          axG: !isNaN(axG) ? axG : null,
          ayG: !isNaN(ayG) ? ayG : null,
          azG: !isNaN(azG) ? azG : null,
          accMag: !isNaN(accMag) ? accMag : null,
          vibRMS: !isNaN(vibRMS) ? vibRMS : null,
          vibPeak: !isNaN(vibPeak) ? vibPeak : null,
          temperature,
        };
      };

      // Format records respecting zero calibration & hardware tare state
      const formattedRecords = (records || []).map(r => {
        const dev = deviceMap.get(r.deviceId) || deviceMap.get(String(r.deviceId).toUpperCase()) || deviceMap.get(String(r.deviceId).toLowerCase());

        // Check hardware zero tare from rawPayload calibration flag
        const isHwCalibrated = Boolean(r.rawPayload?.calibration?.calibrated);
        const hasRefZero = Boolean(dev?.hasReferenceZero || dev?.calibrate);
        const refX = parseFloat(dev?.refThetaX ?? 0.0) || 0.0;
        const refY = parseFloat(dev?.refThetaY ?? 0.0) || 0.0;
        const refZ = parseFloat(dev?.refThetaZ ?? 0.0) || 0.0;
        const L = parseFloat(dev?.gaugeLength_mm ?? 1000.0) || 1000.0;

        let finalXTilt = parseFloat(r.xTilt || 0);
        let finalYTilt = parseFloat(r.yTilt || 0);
        let finalZTilt = parseFloat(r.yaw ?? r.zTilt ?? r.rawPayload?.tilt?.yaw ?? r.rawPayload?.tilt?.zTilt ?? 0) || 0;
        let finalResultant = parseFloat(r.resultantTilt || 0);
        let finalXDisp = parseFloat(r.xDisplacement || 0);
        let finalYDisp = parseFloat(r.yDisplacement || 0);
        let finalZDisp = parseFloat(r.zDisplacement || 0);
        let finalTotalDisp = parseFloat(r.totalDisplacement || 0);

        if (isHwCalibrated) {
          // Hardware already tare zeroed: use rawPayload delta tilt directly
          finalXTilt = parseFloat(r.rawPayload?.tilt?.roll ?? 0) || 0;
          finalYTilt = parseFloat(r.rawPayload?.tilt?.pitch ?? 0) || 0;
          finalZTilt = parseFloat(r.rawPayload?.tilt?.yaw ?? r.rawPayload?.tilt?.zTilt ?? 0) || 0;
          finalResultant = Math.sqrt(finalXTilt * finalXTilt + finalYTilt * finalYTilt);
          if (Math.abs(finalXTilt) < 0.015 && Math.abs(finalYTilt) < 0.015) {
            finalXTilt = 0.0;
            finalYTilt = 0.0;
            finalZTilt = 0.0;
            finalResultant = 0.0;
            finalXDisp = 0.0;
            finalYDisp = 0.0;
            finalZDisp = 0.0;
            finalTotalDisp = 0.0;
          }
        } else if (hasRefZero) {
          // Software reference-zero: compute delta relative to saved baseline
          finalXTilt = finalXTilt - refX;
          finalYTilt = finalYTilt - refY;
          finalZTilt = finalZTilt - refZ;
          finalResultant = Math.sqrt(finalXTilt * finalXTilt + finalYTilt * finalYTilt);
          finalXDisp = L * Math.tan((finalXTilt * Math.PI) / 180.0);
          finalYDisp = L * Math.tan((finalYTilt * Math.PI) / 180.0);
          finalTotalDisp = Math.sqrt(finalXDisp * finalXDisp + finalYDisp * finalYDisp);
        }

        const sensors = extractSensorData(r);

        return {
          timestamp: new Date(r.timestamp).toISOString(),
          time: new Date(r.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          deviceId: r.deviceId,
          resultantTilt: Number(finalResultant.toFixed(4)),
          resultant: Number(finalResultant.toFixed(4)),
          xTilt: Number(finalXTilt.toFixed(4)),
          tiltX: Number(finalXTilt.toFixed(4)),
          yTilt: Number(finalYTilt.toFixed(4)),
          tiltY: Number(finalYTilt.toFixed(4)),
          zTilt: Number(finalZTilt.toFixed(4)),
          tiltZ: Number(finalZTilt.toFixed(4)),
          yaw: Number(finalZTilt.toFixed(4)),
          totalDisplacement: Number(finalTotalDisp.toFixed(4)),
          totalDisp: Number(finalTotalDisp.toFixed(4)),
          xDisplacement: Number(finalXDisp.toFixed(4)),
          xDisp: Number(finalXDisp.toFixed(4)),
          yDisplacement: Number(finalYDisp.toFixed(4)),
          yDisp: Number(finalYDisp.toFixed(4)),
          zDisplacement: Number(finalZDisp.toFixed(4)),
          zDisp: Number(finalZDisp.toFixed(4)),
          // Sensor data - null if not recorded
          accMag: sensors.accMag !== null ? Number(sensors.accMag.toFixed(4)) : null,
          vibrationRMS: sensors.vibRMS !== null ? Number(sensors.vibRMS.toFixed(4)) : null,
          vibRMS: sensors.vibRMS !== null ? Number(sensors.vibRMS.toFixed(4)) : null,
          vibrationPeak: sensors.vibPeak !== null ? Number(sensors.vibPeak.toFixed(4)) : null,
          vibPeak: sensors.vibPeak !== null ? Number(sensors.vibPeak.toFixed(4)) : null,
          temperature: sensors.temperature !== null ? Number(sensors.temperature.toFixed(1)) : null,
        };
      });

      // Compute analytics statistics on formatted records (only non-null values)
      let sumTilt = 0;
      let maxTilt = 0;
      let maxX = 0;
      let maxY = 0;
      let maxZ = 0;
      let maxDisp = 0;
      let maxXDisp = 0;
      let maxYDisp = 0;
      let maxVib = 0;
      let sumTemp = 0;
      let tempCount = 0;

      formattedRecords.forEach(r => {
        const tilt = parseFloat(r.resultantTilt || 0);
        const xt = Math.abs(parseFloat(r.xTilt || 0));
        const yt = Math.abs(parseFloat(r.yTilt || 0));
        const zt = Math.abs(parseFloat(r.zTilt || r.resultantTilt || 0));
        const disp = parseFloat(r.totalDisplacement || 0);
        const xd = Math.abs(parseFloat(r.xDisplacement || 0));
        const yd = Math.abs(parseFloat(r.yDisplacement || 0));
        const vib = r.vibrationPeak !== null ? parseFloat(r.vibrationPeak || 0) : 0;
        const temp = r.temperature;

        sumTilt += tilt;
        if (tilt > maxTilt) maxTilt = tilt;
        if (xt > maxX) maxX = xt;
        if (yt > maxY) maxY = yt;
        if (zt > maxZ) maxZ = zt;
        if (disp > maxDisp) maxDisp = disp;
        if (xd > maxXDisp) maxXDisp = xd;
        if (yd > maxYDisp) maxYDisp = yd;
        if (vib > maxVib) maxVib = vib;
        if (temp !== null && !isNaN(temp)) {
          sumTemp += temp;
          tempCount++;
        }
      });

      const totalCount = formattedRecords.length;
      const avgTilt = totalCount > 0 ? (sumTilt / totalCount).toFixed(4) : 0;
      const avgTemp = tempCount > 0 ? (sumTemp / tempCount).toFixed(2) : null;

      return reply.send({
        statusCode: 200,
        filters: { organizationId, projectId, siteId, deviceId, fromDate, toDate },
        summary: {
          totalDataPoints: totalCount,
          averageResultantTilt: parseFloat(avgTilt),
          maxResultantTilt: parseFloat(maxTilt.toFixed(4)),
          maxXTilt: parseFloat(maxX.toFixed(4)),
          maxYTilt: parseFloat(maxY.toFixed(4)),
          maxZTilt: parseFloat(maxZ.toFixed(4)),
          maxTotalDisplacement_mm: parseFloat(maxDisp.toFixed(4)),
          maxXDisplacement_mm: parseFloat(maxXDisp.toFixed(4)),
          maxYDisplacement_mm: parseFloat(maxYDisp.toFixed(4)),
          maxVibrationPeak_g: parseFloat(maxVib.toFixed(4)),
          averageTemperature_C: avgTemp !== null ? parseFloat(avgTemp) : null,
        },
        timeSeriesData: formattedRecords,
      });
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Report Generation Error', message: err.message });
    }
  });
}
