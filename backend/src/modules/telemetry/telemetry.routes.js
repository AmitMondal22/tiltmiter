import pkg from 'sequelize';
const { Op } = pkg;
import { TelemetryRecord, Device } from '../../models/index.js';
import { inMemoryTelemetryStore } from '../../config/influx.js';
import { authenticate, authenticateOptional } from '../../middleware/authMiddleware.js';

export async function telemetryRoutes(fastify) {
  // Query historical time-series telemetry from PostgreSQL / In-Memory with full date-time support
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

    const hasReferenceZero = Boolean(devRecord?.hasReferenceZero || devRecord?.calibrate);
    const refX = parseFloat(devRecord?.refThetaX ?? 0.0) || 0.0;
    const refY = parseFloat(devRecord?.refThetaY ?? 0.0) || 0.0;
    const refZ = parseFloat(devRecord?.refThetaZ ?? 0.0) || 0.0;
    const L = parseFloat(devRecord?.gaugeLength_mm ?? 1000.0) || 1000.0;

    // Helper to extract sensor values from rawPayload nested structure or flat fields
    const extractFromRecord = (r) => {
      const raw = r.rawPayload || {};
      // Acceleration - prefer rawPayload nested first
      const ax = parseFloat(raw.acceleration?.ax ?? raw.acceleration?.axG ?? r.acceleration?.ax ?? 0) || 0;
      const ay = parseFloat(raw.acceleration?.ay ?? raw.acceleration?.ayG ?? r.acceleration?.ay ?? 0) || 0;
      const az = parseFloat(raw.acceleration?.az ?? raw.acceleration?.azG ?? r.acceleration?.az ?? 0) || 0;
      // Convert m/s² to g if values > 3 (hardware sends m/s²)
      const axG = Math.abs(ax) > 3.0 ? ax / 9.80665 : ax;
      const ayG = Math.abs(ay) > 3.0 ? ay / 9.80665 : ay;
      const azG = Math.abs(az) > 3.0 ? az / 9.80665 : az;
      const accMag = parseFloat(raw.acceleration?.accMag ?? r.acceleration?.accMag ?? Math.sqrt(axG*axG + ayG*ayG + azG*azG)) || null;

      // Vibration
      const vibRMS = parseFloat(raw.vibration?.vibrationRMS ?? raw.vibration?.vibration ?? r.vibration?.vibrationRMS ?? r.vibration?.vibration ?? null);
      const vibPeak = parseFloat(raw.vibration?.vibrationPeak ?? r.vibration?.vibrationPeak ?? null);

      // Temperature - stored as number in DB
      const temperature = parseFloat(r.temperature ?? raw.environment?.temperature ?? null);

      return { ax, ay, az, axG, ayG, azG, accMag, vibRMS, vibPeak, temperature };
    };

    // Helper to format every point ensuring calibration data is correctly applied
    const formatPoint = (pt, extracted = null) => {
      const rawX = parseFloat(pt.xTilt ?? pt.tiltX ?? pt.roll ?? 0) || 0;
      const rawY = parseFloat(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? 0) || 0;
      const rawZ = parseFloat(pt.zTilt ?? pt.tiltZ ?? 0) || 0;
      const rawRes = pt.resultant ?? pt.resultantTilt ?? pt.tilt;
      const calcRes = typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : Math.sqrt(rawX * rawX + rawY * rawY);

      // Check if hardware already performed zero tare (calibration flag in rawPayload)
      const isHwCalibrated = Boolean(pt.rawPayload?.calibration?.calibrated || pt.calibration?.calibrated);

      let finalXTilt = rawX;
      let finalYTilt = rawY;
      let finalZTilt = rawZ;
      let finalResultant = calcRes;
      let finalXDisp = parseFloat(pt.xDisp ?? pt.xDisplacement ?? 0) || 0;
      let finalYDisp = parseFloat(pt.yDisp ?? pt.yDisplacement ?? 0) || 0;
      let finalZDisp = parseFloat(pt.zDisp ?? pt.zDisplacement ?? 0) || 0;
      let finalTotalDisp = parseFloat(pt.totalDisp ?? pt.totalDisplacement ?? 0) || 0;

      if (hasReferenceZero) {
        finalXTilt = rawX - refX;
        finalYTilt = rawY - refY;
        finalZTilt = rawZ - refZ;
        finalResultant = Math.sqrt(finalXTilt * finalXTilt + finalYTilt * finalYTilt);
        finalXDisp = L * Math.tan((finalXTilt * Math.PI) / 180.0);
        finalYDisp = L * Math.tan((finalYTilt * Math.PI) / 180.0);
        finalTotalDisp = Math.sqrt(finalXDisp * finalXDisp + finalYDisp * finalYDisp);
      }

      // Use extracted sensor values (no dummy fallbacks - null means no data)
      const sensors = extracted || {};
      const axG = sensors.axG ?? parseFloat(pt.axG ?? pt.ax ?? null);
      const ayG = sensors.ayG ?? parseFloat(pt.ayG ?? pt.ay ?? null);
      const azG = sensors.azG ?? parseFloat(pt.azG ?? pt.az ?? null);
      const accMag = sensors.accMag ?? parseFloat(pt.accMag ?? null);
      const vibRMS = sensors.vibRMS ?? parseFloat(pt.vibRMS ?? pt.vibrationRMS ?? null);
      const vibPeak = sensors.vibPeak ?? parseFloat(pt.vibPeak ?? pt.vibrationPeak ?? null);
      const temperature = sensors.temperature ?? parseFloat(pt.temp ?? pt.temperature ?? null);

      return {
        time: new Date(pt.timestamp || pt.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        timestamp: new Date(pt.timestamp || pt.time).toISOString(),
        deviceId: pt.deviceId || deviceId,
        xTilt: Number(finalXTilt.toFixed(4)),
        tiltX: Number(finalXTilt.toFixed(4)),
        roll: Number(finalXTilt.toFixed(4)),
        yTilt: Number(finalYTilt.toFixed(4)),
        tiltY: Number(finalYTilt.toFixed(4)),
        pitch: Number(finalYTilt.toFixed(4)),
        zTilt: Number(finalZTilt.toFixed(4)),
        tiltZ: Number(finalZTilt.toFixed(4)),
        resultant: Number(finalResultant.toFixed(4)),
        resultantTilt: Number(finalResultant.toFixed(4)),
        tilt: Number(finalResultant.toFixed(4)),
        xDisp: Number(finalXDisp.toFixed(3)),
        xDisplacement: Number(finalXDisp.toFixed(3)),
        yDisp: Number(finalYDisp.toFixed(3)),
        yDisplacement: Number(finalYDisp.toFixed(3)),
        zDisp: Number(finalZDisp.toFixed(3)),
        zDisplacement: Number(finalZDisp.toFixed(3)),
        totalDisp: Number(finalTotalDisp.toFixed(3)),
        totalDisplacement: Number(finalTotalDisp.toFixed(3)),
        deltaThetaX: hasReferenceZero ? Number(finalXTilt.toFixed(4)) : (pt.deltaThetaX ?? 0.0),
        deltaThetaY: hasReferenceZero ? Number(finalYTilt.toFixed(4)) : (pt.deltaThetaY ?? 0.0),
        deltaThetaZ: hasReferenceZero ? Number(finalZTilt.toFixed(4)) : (pt.deltaThetaZ ?? 0.0),
        // Sensor data - null if not available in DB record
        axG: axG !== null && !isNaN(axG) ? Number(axG.toFixed(4)) : null,
        ayG: ayG !== null && !isNaN(ayG) ? Number(ayG.toFixed(4)) : null,
        azG: azG !== null && !isNaN(azG) ? Number(azG.toFixed(4)) : null,
        accMag: accMag !== null && !isNaN(accMag) ? Number(accMag.toFixed(4)) : null,
        vibRMS: vibRMS !== null && !isNaN(vibRMS) ? Number(vibRMS.toFixed(4)) : null,
        vibrationRMS: vibRMS !== null && !isNaN(vibRMS) ? Number(vibRMS.toFixed(4)) : null,
        vibPeak: vibPeak !== null && !isNaN(vibPeak) ? Number(vibPeak.toFixed(4)) : null,
        vibrationPeak: vibPeak !== null && !isNaN(vibPeak) ? Number(vibPeak.toFixed(4)) : null,
        temperature: temperature !== null && !isNaN(temperature) ? Number(temperature.toFixed(1)) : null,
        temp: temperature !== null && !isNaN(temperature) ? Number(temperature.toFixed(1)) : null,
      };
    };

    // 1. Query PostgreSQL TelemetryRecord table (primary data store)
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
        const history = dbRecords.map(r => {
          const extracted = extractFromRecord(r);
          return formatPoint({
            timestamp: new Date(r.timestamp).toISOString(),
            deviceId: r.deviceId,
            xTilt: parseFloat(r.xTilt || 0),
            yTilt: parseFloat(r.yTilt || 0),
            zTilt: parseFloat(r.zTilt || r.resultantTilt || 0),
            resultantTilt: parseFloat(r.resultantTilt || 0),
            xDisplacement: parseFloat(r.xDisplacement || 0),
            yDisplacement: parseFloat(r.yDisplacement || 0),
            zDisplacement: parseFloat(r.zDisplacement || 0),
            totalDisplacement: parseFloat(r.totalDisplacement || 0),
            rawPayload: r.rawPayload || null,
            acceleration: r.acceleration || null,
            vibration: r.vibration || null,
          }, extracted);
        });

        return reply.send({
          statusCode: 200,
          deviceId,
          source: 'PostgreSQL DB',
          totalPoints: history.length,
          history,
        });
      }
    } catch (err) {
      fastify.log.warn('[Telemetry] PostgreSQL query error:', err.message);
    }

    // 2. Query In-Memory Ring Buffer Map (fallback for very recent data before DB write)
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
        history: memList.map(pt => formatPoint(pt)),
      });
    }

    // 3. If no history recorded yet for selected device & range, return empty dataset
    return reply.send({
      statusCode: 200,
      deviceId,
      source: 'PostgreSQL DB',
      totalPoints: 0,
      history: [],
    });
  });
}
