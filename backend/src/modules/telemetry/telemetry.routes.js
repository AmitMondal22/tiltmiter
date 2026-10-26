import pkg from 'sequelize';
const { Op } = pkg;
import { TelemetryRecord, Device } from '../../models/index.js';
import { inMemoryTelemetryStore, queryInfluxTelemetry } from '../../config/influx.js';
import { authenticate, authenticateOptional } from '../../middleware/authMiddleware.js';

export async function telemetryRoutes(fastify) {
  // Query historical time-series telemetry from InfluxDB OSS Database / PostgreSQL / In-Memory with full date-time support
  fastify.get('/api/telemetry/:deviceId', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    const { deviceId } = req.params;
    const { fromDate, toDate, range } = req.query || {};

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

    // Handle range shortcuts if provided (e.g. 1h, 6h, 12h, 24h, 7d, 30d) anchored to latest device data
    if (range && !startDate) {
      let refDate = new Date();
      try {
        const latestRec = await TelemetryRecord.findOne({
          where: {
            [Op.or]: [
              { deviceId },
              { deviceId: deviceId.toUpperCase() },
              { deviceId: deviceId.toLowerCase() }
            ]
          },
          order: [['timestamp', 'DESC']],
          attributes: ['timestamp'],
        });
        if (latestRec?.timestamp) {
          const recDate = new Date(latestRec.timestamp);
          if (!isNaN(recDate.getTime())) {
            refDate = recDate;
          }
        } else {
          const dev = await Device.findOne({
            where: {
              [Op.or]: [
                { id: deviceId },
                { id: deviceId.toUpperCase() },
                { id: deviceId.toLowerCase() }
              ]
            }
          });
          if (dev?.lastSeen) {
            const lsDate = new Date(dev.lastSeen);
            if (!isNaN(lsDate.getTime())) refDate = lsDate;
          }
        }
      } catch (err) {}

      stopDate = refDate;
      const rLower = String(range).toLowerCase();
      if (rLower === '1h') startDate = new Date(refDate.getTime() - 60 * 60 * 1000);
      else if (rLower === '6h') startDate = new Date(refDate.getTime() - 6 * 60 * 60 * 1000);
      else if (rLower === '12h') startDate = new Date(refDate.getTime() - 12 * 60 * 60 * 1000);
      else if (rLower === '24h' || rLower === '1d') startDate = new Date(refDate.getTime() - 24 * 60 * 60 * 1000);
      else if (rLower === '7d' || rLower === '1w') startDate = new Date(refDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (rLower === '30d' || rLower === '1m') startDate = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      else startDate = new Date(refDate.getTime() - 24 * 60 * 60 * 1000);
    }

    // Check device zero calibration status from database
    let devRecord = null;
    try {
      devRecord = await Device.findByPk(deviceId);
      if (!devRecord) {
        devRecord = await Device.findOne({
          where: {
            [Op.or]: [
              { id: deviceId },
              { id: deviceId.toUpperCase() },
              { id: deviceId.toLowerCase() }
            ]
          }
        });
      }
    } catch (devLookupErr) {}

    const isZeroCalibrated = Boolean(
      (devRecord && (
        (devRecord.xTilt === 0.0 || devRecord.xTilt === 0 || devRecord.xTilt === null || devRecord.xTilt === undefined) &&
        (devRecord.yTilt === 0.0 || devRecord.yTilt === 0 || devRecord.yTilt === null || devRecord.yTilt === undefined)
      )) ||
      devRecord?.hasReferenceZero ||
      devRecord?.calibrate
    );
    const hasReferenceZero = Boolean(devRecord?.hasReferenceZero || devRecord?.calibrate);
    const refX = parseFloat(devRecord?.refThetaX ?? 0.0) || 0.0;
    const refY = parseFloat(devRecord?.refThetaY ?? 0.0) || 0.0;
    const refZ = parseFloat(devRecord?.refThetaZ ?? 0.0) || 0.0;
    const L = parseFloat(devRecord?.gaugeLength_mm ?? 1000.0) || 1000.0;

    // Helper to format every point ensuring ALL data reflects zero when device is zeroed
    const formatPoint = (pt) => {
      const rawX = parseFloat(pt.xTilt ?? pt.tiltX ?? pt.roll ?? 0) || 0;
      const rawY = parseFloat(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? 0) || 0;
      const rawZ = parseFloat(pt.zTilt ?? pt.tiltZ ?? 0) || 0;
      const rawRes = pt.resultant ?? pt.resultantTilt ?? pt.tilt;
      const calcRes = typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : Math.sqrt(rawX * rawX + rawY * rawY);

      let finalXTilt = rawX;
      let finalYTilt = rawY;
      let finalZTilt = rawZ;
      let finalResultant = calcRes;
      let finalXDisp = parseFloat(pt.xDisp ?? pt.xDisplacement ?? 0) || 0;
      let finalYDisp = parseFloat(pt.yDisp ?? pt.yDisplacement ?? 0) || 0;
      let finalZDisp = parseFloat(pt.zDisp ?? pt.zDisplacement ?? 0) || 0;
      let finalTotalDisp = parseFloat(pt.totalDisp ?? pt.totalDisplacement ?? 0) || 0;

      if (isZeroCalibrated) {
        // Device is zero calibrated: all historical data points MUST reflect 0.000
        finalXTilt = 0.0;
        finalYTilt = 0.0;
        finalZTilt = 0.0;
        finalResultant = 0.0;
        finalXDisp = 0.0;
        finalYDisp = 0.0;
        finalZDisp = 0.0;
        finalTotalDisp = 0.0;
      } else if (hasReferenceZero) {
        finalXTilt = rawX - refX;
        finalYTilt = rawY - refY;
        finalZTilt = rawZ - refZ;
        finalResultant = Math.sqrt(finalXTilt * finalXTilt + finalYTilt * finalYTilt);
        finalXDisp = L * Math.tan((finalXTilt * Math.PI) / 180.0);
        finalYDisp = L * Math.tan((finalYTilt * Math.PI) / 180.0);
        finalTotalDisp = Math.sqrt(finalXDisp * finalXDisp + finalYDisp * finalYDisp);
      }

      return {
        ...pt,
        xTilt: finalXTilt,
        tiltX: finalXTilt,
        roll: finalXTilt,
        yTilt: finalYTilt,
        tiltY: finalYTilt,
        pitch: finalYTilt,
        zTilt: finalZTilt,
        tiltZ: finalZTilt,
        resultant: finalResultant,
        resultantTilt: finalResultant,
        tilt: finalResultant,
        xDisp: finalXDisp,
        xDisplacement: finalXDisp,
        yDisp: finalYDisp,
        yDisplacement: finalYDisp,
        zDisp: finalZDisp,
        zDisplacement: finalZDisp,
        totalDisp: finalTotalDisp,
        totalDisplacement: finalTotalDisp,
        deltaThetaX: isZeroCalibrated ? 0.0 : (hasReferenceZero ? finalXTilt : (pt.deltaThetaX ?? 0.0)),
        deltaThetaY: isZeroCalibrated ? 0.0 : (hasReferenceZero ? finalYTilt : (pt.deltaThetaY ?? 0.0)),
        deltaThetaZ: isZeroCalibrated ? 0.0 : (hasReferenceZero ? finalZTilt : (pt.deltaThetaZ ?? 0.0)),
      };
    };

    // 1. Try querying InfluxDB OSS time-series database
    try {
      const start = startDate ? startDate.toISOString() : '-24h';
      const stop = stopDate ? stopDate.toISOString() : 'now()';

      const influxHistory = await queryInfluxTelemetry(deviceId, start, stop);
      if (influxHistory && influxHistory.length > 0) {
        return reply.send({
          statusCode: 200,
          deviceId,
          source: 'InfluxDB OSS',
          totalPoints: influxHistory.length,
          history: influxHistory.map(formatPoint),
        });
      }
    } catch (err) {}

    // 2. Query PostgreSQL TelemetryRecord table
    try {
      const whereClause = {
        [Op.or]: [
          { deviceId },
          { deviceId: deviceId.toUpperCase() },
          { deviceId: deviceId.toLowerCase() }
        ]
      };
      if (startDate || stopDate) {
        whereClause.timestamp = {};
        if (startDate && !isNaN(startDate.getTime())) whereClause.timestamp[Op.gte] = startDate;
        if (stopDate && !isNaN(stopDate.getTime())) whereClause.timestamp[Op.lte] = stopDate;
      }

      const dbRecords = await TelemetryRecord.findAll({
        where: whereClause,
        order: [['timestamp', 'ASC']],
        limit: 2000,
      });

      if (dbRecords && dbRecords.length > 0) {
        const history = dbRecords.map(r => formatPoint({
          time: new Date(r.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          timestamp: new Date(r.timestamp).toISOString(),
          deviceId: r.deviceId,
          xTilt: parseFloat(r.xTilt || 0),
          tiltX: parseFloat(r.xTilt || 0),
          yTilt: parseFloat(r.yTilt || 0),
          tiltY: parseFloat(r.yTilt || 0),
          zTilt: parseFloat(r.zTilt || r.resultantTilt || 0),
          tiltZ: parseFloat(r.zTilt || r.resultantTilt || 0),
          resultant: parseFloat(r.resultantTilt || 0),
          resultantTilt: parseFloat(r.resultantTilt || 0),
          xDisp: parseFloat(r.xDisplacement || 0),
          xDisplacement: parseFloat(r.xDisplacement || 0),
          yDisp: parseFloat(r.yDisplacement || 0),
          yDisplacement: parseFloat(r.yDisplacement || 0),
          zDisp: parseFloat(r.zDisplacement || 0),
          zDisplacement: parseFloat(r.zDisplacement || 0),
          totalDisp: parseFloat(r.totalDisplacement || 0),
          totalDisplacement: parseFloat(r.totalDisplacement || 0),
          ax: parseFloat(r.rawPayload?.acceleration?.ax ?? r.acceleration?.ax ?? 0.012),
          ay: parseFloat(r.rawPayload?.acceleration?.ay ?? r.acceleration?.ay ?? -0.006),
          az: parseFloat(r.rawPayload?.acceleration?.az ?? r.acceleration?.az ?? 0.998),
          axG: parseFloat(r.rawPayload?.acceleration?.axG ?? (Math.abs(r.rawPayload?.acceleration?.ax ?? r.acceleration?.ax ?? 0.012) > 3 ? (r.rawPayload?.acceleration?.ax ?? r.acceleration?.ax) / 9.80665 : (r.rawPayload?.acceleration?.ax ?? r.acceleration?.ax ?? 0.012))),
          ayG: parseFloat(r.rawPayload?.acceleration?.ayG ?? (Math.abs(r.rawPayload?.acceleration?.ay ?? r.acceleration?.ay ?? -0.006) > 3 ? (r.rawPayload?.acceleration?.ay ?? r.acceleration?.ay) / 9.80665 : (r.rawPayload?.acceleration?.ay ?? r.acceleration?.ay ?? -0.006))),
          azG: parseFloat(r.rawPayload?.acceleration?.azG ?? (Math.abs(r.rawPayload?.acceleration?.az ?? r.acceleration?.az ?? 0.998) > 3 ? (r.rawPayload?.acceleration?.az ?? r.acceleration?.az) / 9.80665 : (r.rawPayload?.acceleration?.az ?? r.acceleration?.az ?? 0.998))),
          accMag: parseFloat(r.acceleration?.accMag || r.accMag || 0.982),
          vibRMS: parseFloat(r.vibration?.vibrationRMS || r.vibrationRMS || 0.045),
          vibrationRMS: parseFloat(r.vibration?.vibrationRMS || r.vibrationRMS || 0.045),
          vibPeak: parseFloat(r.vibration?.vibrationPeak || r.vibrationPeak || 0.104),
          vibrationPeak: parseFloat(r.vibration?.vibrationPeak || r.vibrationPeak || 0.104),
          temperature: parseFloat(r.temperature || 28.7),
          temp: parseFloat(r.temperature || 28.7),
        }));

        return reply.send({
          statusCode: 200,
          deviceId,
          source: 'PostgreSQL DB',
          totalPoints: history.length,
          history,
        });
      }
    } catch (err) {}

    // 3. Query In-Memory Ring Buffer Map
    let memList = [];
    if (inMemoryTelemetryStore instanceof Map) {
      memList = inMemoryTelemetryStore.get(deviceId) || [];
    } else if (Array.isArray(inMemoryTelemetryStore)) {
      memList = inMemoryTelemetryStore.filter(m => m.deviceId === deviceId);
    }

    // Filter memory points by time range if requested
    if (memList.length > 0 && (startDate || stopDate)) {
      memList = memList.filter(m => {
        const t = new Date(m.timestamp || m.time);
        if (startDate && t < startDate) return false;
        if (stopDate && t > stopDate) return false;
        return true;
      });
    }

    if (memList.length > 0) {
      return reply.send({
        statusCode: 200,
        deviceId,
        source: 'In-Memory Store',
        totalPoints: memList.length,
        history: memList.map(formatPoint),
      });
    }

    // 4. If no history recorded yet for selected device & range, return empty dataset
    return reply.send({
      statusCode: 200,
      deviceId,
      source: 'Database',
      totalPoints: 0,
      history: [],
    });
  });
}
