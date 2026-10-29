import pkg from 'sequelize';
const { Op } = pkg;
import { TelemetryRecord, Device } from '../../models/index.js';
import { inMemoryTelemetryStore } from '../../services/telemetryStore.js';
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

      const anchorTime = Math.max(Date.now(), refDate.getTime());
      const rLower = String(range).toLowerCase();
      let durationMs = 24 * 60 * 60 * 1000;
      if (rLower === '1h') durationMs = 60 * 60 * 1000;
      else if (rLower === '6h') durationMs = 6 * 60 * 60 * 1000;
      else if (rLower === '12h') durationMs = 12 * 60 * 60 * 1000;
      else if (rLower === '24h' || rLower === '1d') durationMs = 24 * 60 * 60 * 1000;
      else if (rLower === '7d' || rLower === '1w') durationMs = 7 * 24 * 60 * 60 * 1000;
      else if (rLower === '30d' || rLower === '1m') durationMs = 30 * 24 * 60 * 60 * 1000;
      startDate = new Date(anchorTime - durationMs);
      stopDate = null; // Do not cap upper bound so newly ingested points are never filtered out
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
    const refX = hasReferenceZero ? (parseFloat(devRecord?.refThetaX ?? 0.0) || 0.0) : 0.0;
    const refY = hasReferenceZero ? (parseFloat(devRecord?.refThetaY ?? 0.0) || 0.0) : 0.0;
    const refZ = hasReferenceZero ? (parseFloat(devRecord?.refThetaZ ?? 0.0) || 0.0) : 0.0;
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
      const rawEnvTemp = r.temperature ?? raw.environment?.temperature;
      const temperature = (rawEnvTemp !== undefined && rawEnvTemp !== null && !isNaN(parseFloat(rawEnvTemp)))
        ? parseFloat(rawEnvTemp)
        : null;

      return { ax, ay, az, axG, ayG, azG, accMag, vibRMS, vibPeak, temperature };
    };

    // Helper to format every point ensuring calibration data is correctly applied
    const formatPoint = (pt, extracted = null) => {
      const rawX = parseFloat(pt.xTilt ?? pt.tiltX ?? pt.roll ?? pt.rawPayload?.tilt?.roll ?? 0) || 0;
      const rawY = parseFloat(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? pt.rawPayload?.tilt?.pitch ?? 0) || 0;
      const rawZ = parseFloat(pt.yaw ?? pt.zTilt ?? pt.tiltZ ?? pt.rawPayload?.tilt?.yaw ?? pt.rawPayload?.tilt?.zTilt ?? 0) || 0;
      const rawRes = pt.resultant ?? pt.resultantTilt ?? pt.tilt ?? pt.rawPayload?.tilt?.tilt;
      const calcRes = typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : Math.sqrt(rawX * rawX + rawY * rawY);

      // Present Values = Pure actual device values (NEVER subtracted by reference zero)
      const presentX = rawX;
      const presentY = rawY;
      const presentZ = rawZ;
      const presentResultant = calcRes;

      // Delta Values = Current Roll/Pitch/Yaw − Zero Reference Roll/Pitch/Yaw
      // Formula: Delta = Current - Reference
      const deltaThetaX = rawX - refX;
      const deltaThetaY = rawY - refY;
      const deltaThetaZ = rawZ - refZ;

      // Device-provided displacement data (fallback to clino formula only if device displacement not sent)
      const rawDisp = pt.displacement || pt.rawPayload?.displacement || {};
      const devXDisp = rawDisp.xDisplacement_mm ?? pt.xDisplacement_mm ?? pt.xDisplacement ?? pt.xDisp;
      const devYDisp = rawDisp.yDisplacement_mm ?? pt.yDisplacement_mm ?? pt.yDisplacement ?? pt.yDisp;
      const devZDisp = rawDisp.zDisplacement_mm ?? pt.zDisplacement_mm ?? pt.zDisplacement ?? pt.zDisp;
      const devTotDisp = rawDisp.totalDisplacement_mm ?? pt.totalDisplacement_mm ?? pt.totalDisplacement ?? pt.totalDisp;

      const clinoDx = L * Math.tan((deltaThetaX * Math.PI) / 180.0);
      const clinoDy = L * Math.tan((deltaThetaY * Math.PI) / 180.0);
      const finalXDisp = (devXDisp !== undefined && devXDisp !== null && !isNaN(parseFloat(devXDisp)))
        ? parseFloat(devXDisp)
        : (!isNaN(clinoDx) ? clinoDx : 0.0);
      const finalYDisp = (devYDisp !== undefined && devYDisp !== null && !isNaN(parseFloat(devYDisp)))
        ? parseFloat(devYDisp)
        : (!isNaN(clinoDy) ? clinoDy : 0.0);
      const finalZDisp = (devZDisp !== undefined && devZDisp !== null && !isNaN(parseFloat(devZDisp)))
        ? parseFloat(devZDisp)
        : (parseFloat(pt.zDisp ?? pt.zDisplacement ?? 0) || 0.0);
      const finalTotalDisp = (devTotDisp !== undefined && devTotDisp !== null && !isNaN(parseFloat(devTotDisp)))
        ? parseFloat(devTotDisp)
        : Math.sqrt(finalXDisp * finalXDisp + finalYDisp * finalYDisp + finalZDisp * finalZDisp);

      // Use extracted sensor values (no dummy fallbacks - null means no data)
      const sensors = extracted || {};
      const axG = sensors.axG ?? parseFloat(pt.axG ?? pt.ax ?? null);
      const ayG = sensors.ayG ?? parseFloat(pt.ayG ?? pt.ay ?? null);
      const azG = sensors.azG ?? parseFloat(pt.azG ?? pt.az ?? null);
      const accMag = sensors.accMag ?? parseFloat(pt.accMag ?? null);
      const vibRMS = sensors.vibRMS ?? parseFloat(pt.vibRMS ?? pt.vibrationRMS ?? null);
      const rawPtTemp = sensors.temperature ?? pt.temp ?? pt.temperature ?? pt.rawPayload?.environment?.temperature;
      const temperature = (rawPtTemp !== undefined && rawPtTemp !== null && !isNaN(parseFloat(rawPtTemp)))
        ? parseFloat(rawPtTemp)
        : null;

      return {
        time: new Date(pt.timestamp || pt.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        timestamp: new Date(pt.timestamp || pt.time).toISOString(),
        deviceId: pt.deviceId || deviceId,

        // Present Values = Pure actual device values (Never subtracted by reference zero)
        presentX,
        presentY,
        presentZ,
        presentRoll: presentX,
        presentPitch: presentY,
        presentYaw: presentZ,
        xTilt: presentX,
        tiltX: presentX,
        roll: presentX,
        yTilt: presentY,
        tiltY: presentY,
        pitch: presentY,
        zTilt: presentZ,
        tiltZ: presentZ,
        yaw: presentZ,
        resultant: presentResultant,
        resultantTilt: presentResultant,
        tilt: presentResultant,

        // Delta Values = Current Roll/Pitch/Yaw − Zero Reference Roll/Pitch/Yaw
        deltaX: deltaThetaX,
        deltaY: deltaThetaY,
        deltaZ: deltaThetaZ,
        deltaThetaX,
        deltaThetaY,
        deltaThetaZ,

        refThetaX: refX,
        refThetaY: refY,
        refThetaZ: refZ,
        hasReferenceZero,

        xDisp: Number(finalXDisp.toFixed(3)),
        xDisplacement: Number(finalXDisp.toFixed(3)),
        yDisp: Number(finalYDisp.toFixed(3)),
        yDisplacement: Number(finalYDisp.toFixed(3)),
        zDisp: Number(finalZDisp.toFixed(3)),
        zDisplacement: Number(finalZDisp.toFixed(3)),
        totalDisp: Number(finalTotalDisp.toFixed(3)),
        totalDisplacement: Number(finalTotalDisp.toFixed(3)),
        xDisplacement_mm: Number(finalXDisp.toFixed(4)),
        yDisplacement_mm: Number(finalYDisp.toFixed(4)),
        zDisplacement_mm: Number(finalZDisp.toFixed(4)),
        totalDisplacement_mm: Number(finalTotalDisp.toFixed(4)),
        displacement: {
          xDisplacement_mm: Number(finalXDisp.toFixed(4)),
          yDisplacement_mm: Number(finalYDisp.toFixed(4)),
          zDisplacement_mm: Number(finalZDisp.toFixed(4)),
          totalDisplacement_mm: Number(finalTotalDisp.toFixed(4)),
        },
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
        order: [['timestamp', 'DESC']],
        limit: 2000,
      });

      if (dbRecords && dbRecords.length > 0) {
        // Chronological order for time-series charts & tables
        dbRecords.reverse();
        const history = dbRecords.map(r => {
          const extracted = extractFromRecord(r);
          return formatPoint({
            timestamp: new Date(r.timestamp).toISOString(),
            deviceId: r.deviceId,
            xTilt: (r.xTilt !== undefined && r.xTilt !== null && !isNaN(parseFloat(r.xTilt))) ? parseFloat(r.xTilt) : 0,
            yTilt: (r.yTilt !== undefined && r.yTilt !== null && !isNaN(parseFloat(r.yTilt))) ? parseFloat(r.yTilt) : 0,
            zTilt: (r.zTilt !== undefined && r.zTilt !== null && !isNaN(parseFloat(r.zTilt))) ? parseFloat(r.zTilt) : ((r.yaw !== undefined && r.yaw !== null && !isNaN(parseFloat(r.yaw))) ? parseFloat(r.yaw) : 0),
            resultantTilt: (r.resultantTilt !== undefined && r.resultantTilt !== null && !isNaN(parseFloat(r.resultantTilt))) ? parseFloat(r.resultantTilt) : 0,
            xDisplacement: (r.xDisplacement !== undefined && r.xDisplacement !== null && !isNaN(parseFloat(r.xDisplacement))) ? parseFloat(r.xDisplacement) : 0,
            yDisplacement: (r.yDisplacement !== undefined && r.yDisplacement !== null && !isNaN(parseFloat(r.yDisplacement))) ? parseFloat(r.yDisplacement) : 0,
            zDisplacement: (r.zDisplacement !== undefined && r.zDisplacement !== null && !isNaN(parseFloat(r.zDisplacement))) ? parseFloat(r.zDisplacement) : 0,
            totalDisplacement: (r.totalDisplacement !== undefined && r.totalDisplacement !== null && !isNaN(parseFloat(r.totalDisplacement))) ? parseFloat(r.totalDisplacement) : 0,
            rawPayload: r.rawPayload || null,
            acceleration: r.acceleration || null,
            vibration: r.vibration || null,
          }, extracted);
        });

        // Fetch latest point directly from telemetry_records for this device
        let latestPoint = null;
        try {
          const latestDbRec = await TelemetryRecord.findOne({
            where: {
              [Op.or]: [
                { deviceId },
                { deviceId: deviceId.toUpperCase() },
                { deviceId: deviceId.toLowerCase() }
              ]
            },
            order: [['timestamp', 'DESC']],
          });
          if (latestDbRec) {
            const ext = extractFromRecord(latestDbRec);
            latestPoint = formatPoint({
              timestamp: new Date(latestDbRec.timestamp).toISOString(),
              deviceId: latestDbRec.deviceId,
              xTilt: (latestDbRec.xTilt !== undefined && latestDbRec.xTilt !== null && !isNaN(parseFloat(latestDbRec.xTilt))) ? parseFloat(latestDbRec.xTilt) : 0,
              yTilt: (latestDbRec.yTilt !== undefined && latestDbRec.yTilt !== null && !isNaN(parseFloat(latestDbRec.yTilt))) ? parseFloat(latestDbRec.yTilt) : 0,
              zTilt: (latestDbRec.zTilt !== undefined && latestDbRec.zTilt !== null && !isNaN(parseFloat(latestDbRec.zTilt))) ? parseFloat(latestDbRec.zTilt) : ((latestDbRec.yaw !== undefined && latestDbRec.yaw !== null && !isNaN(parseFloat(latestDbRec.yaw))) ? parseFloat(latestDbRec.yaw) : 0),
              resultantTilt: (latestDbRec.resultantTilt !== undefined && latestDbRec.resultantTilt !== null && !isNaN(parseFloat(latestDbRec.resultantTilt))) ? parseFloat(latestDbRec.resultantTilt) : 0,
              xDisplacement: (latestDbRec.xDisplacement !== undefined && latestDbRec.xDisplacement !== null && !isNaN(parseFloat(latestDbRec.xDisplacement))) ? parseFloat(latestDbRec.xDisplacement) : 0,
              yDisplacement: (latestDbRec.yDisplacement !== undefined && latestDbRec.yDisplacement !== null && !isNaN(parseFloat(latestDbRec.yDisplacement))) ? parseFloat(latestDbRec.yDisplacement) : 0,
              zDisplacement: (latestDbRec.zDisplacement !== undefined && latestDbRec.zDisplacement !== null && !isNaN(parseFloat(latestDbRec.zDisplacement))) ? parseFloat(latestDbRec.zDisplacement) : 0,
              totalDisplacement: (latestDbRec.totalDisplacement !== undefined && latestDbRec.totalDisplacement !== null && !isNaN(parseFloat(latestDbRec.totalDisplacement))) ? parseFloat(latestDbRec.totalDisplacement) : 0,
              rawPayload: latestDbRec.rawPayload || null,
              acceleration: latestDbRec.acceleration || null,
              vibration: latestDbRec.vibration || null,
            }, ext);
          }
        } catch (e) {}

        return reply.send({
          statusCode: 200,
          deviceId,
          source: 'PostgreSQL DB',
          totalPoints: history.length,
          history,
          latest: latestPoint,
        });
      }
    } catch (err) {
      fastify.log.warn('[Telemetry] PostgreSQL query error:', err.message);
    }

    // 2. If no history recorded in PostgreSQL for selected device & range, check for latest point
    let latestPoint = null;
    try {
      const latestDbRec = await TelemetryRecord.findOne({
        where: {
          [Op.or]: [
            { deviceId },
            { deviceId: deviceId.toUpperCase() },
            { deviceId: deviceId.toLowerCase() }
          ]
        },
        order: [['timestamp', 'DESC']],
      });
      if (latestDbRec) {
        const ext = extractFromRecord(latestDbRec);
        latestPoint = formatPoint({
          timestamp: new Date(latestDbRec.timestamp).toISOString(),
          deviceId: latestDbRec.deviceId,
          xTilt: (latestDbRec.xTilt !== undefined && latestDbRec.xTilt !== null && !isNaN(parseFloat(latestDbRec.xTilt))) ? parseFloat(latestDbRec.xTilt) : 0,
          yTilt: (latestDbRec.yTilt !== undefined && latestDbRec.yTilt !== null && !isNaN(parseFloat(latestDbRec.yTilt))) ? parseFloat(latestDbRec.yTilt) : 0,
          zTilt: (latestDbRec.zTilt !== undefined && latestDbRec.zTilt !== null && !isNaN(parseFloat(latestDbRec.zTilt))) ? parseFloat(latestDbRec.zTilt) : ((latestDbRec.yaw !== undefined && latestDbRec.yaw !== null && !isNaN(parseFloat(latestDbRec.yaw))) ? parseFloat(latestDbRec.yaw) : 0),
          resultantTilt: (latestDbRec.resultantTilt !== undefined && latestDbRec.resultantTilt !== null && !isNaN(parseFloat(latestDbRec.resultantTilt))) ? parseFloat(latestDbRec.resultantTilt) : 0,
          xDisplacement: (latestDbRec.xDisplacement !== undefined && latestDbRec.xDisplacement !== null && !isNaN(parseFloat(latestDbRec.xDisplacement))) ? parseFloat(latestDbRec.xDisplacement) : 0,
          yDisplacement: (latestDbRec.yDisplacement !== undefined && latestDbRec.yDisplacement !== null && !isNaN(parseFloat(latestDbRec.yDisplacement))) ? parseFloat(latestDbRec.yDisplacement) : 0,
          zDisplacement: (latestDbRec.zDisplacement !== undefined && latestDbRec.zDisplacement !== null && !isNaN(parseFloat(latestDbRec.zDisplacement))) ? parseFloat(latestDbRec.zDisplacement) : 0,
          totalDisplacement: (latestDbRec.totalDisplacement !== undefined && latestDbRec.totalDisplacement !== null && !isNaN(parseFloat(latestDbRec.totalDisplacement))) ? parseFloat(latestDbRec.totalDisplacement) : 0,
          rawPayload: latestDbRec.rawPayload || null,
          acceleration: latestDbRec.acceleration || null,
          vibration: latestDbRec.vibration || null,
        }, ext);
      }
    } catch (e) {}

    return reply.send({
      statusCode: 200,
      deviceId,
      source: 'PostgreSQL DB',
      totalPoints: latestPoint ? 1 : 0,
      history: latestPoint ? [latestPoint] : [],
      latest: latestPoint,
    });
  });

  // Query single latest telemetry point for a device directly from telemetry_records
  fastify.get('/api/telemetry/:deviceId/latest', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    const { deviceId } = req.params;
    try {
      const devRecord = await Device.findOne({
        where: {
          [Op.or]: [
            { id: deviceId },
            { id: deviceId.toUpperCase() },
            { id: deviceId.toLowerCase() }
          ]
        }
      });

      const hasReferenceZero = Boolean(devRecord?.hasReferenceZero || devRecord?.calibrate);
      const refX = hasReferenceZero ? (parseFloat(devRecord?.refThetaX ?? 0.0) || 0.0) : 0.0;
      const refY = hasReferenceZero ? (parseFloat(devRecord?.refThetaY ?? 0.0) || 0.0) : 0.0;
      const refZ = hasReferenceZero ? (parseFloat(devRecord?.refThetaZ ?? 0.0) || 0.0) : 0.0;
      const L = parseFloat(devRecord?.gaugeLength_mm ?? 1000.0) || 1000.0;

      const latestDbRec = await TelemetryRecord.findOne({
        where: {
          [Op.or]: [
            { deviceId },
            { deviceId: deviceId.toUpperCase() },
            { deviceId: deviceId.toLowerCase() }
          ]
        },
        order: [['timestamp', 'DESC']],
      });

      if (!latestDbRec) {
        return reply.send({ statusCode: 200, deviceId, latest: null });
      }

      const raw = latestDbRec.rawPayload || {};
      const rawX = parseFloat(latestDbRec.xTilt ?? raw.tilt?.roll ?? 0) || 0;
      const rawY = parseFloat(latestDbRec.yTilt ?? raw.tilt?.pitch ?? 0) || 0;
      const rawZ = parseFloat(latestDbRec.zTilt ?? latestDbRec.yaw ?? raw.tilt?.yaw ?? 0) || 0;
      const calcRes = Math.sqrt(rawX * rawX + rawY * rawY);

      const deltaX = rawX - refX;
      const deltaY = rawY - refY;
      const deltaZ = rawZ - refZ;

      const rawDisp = latestDbRec.displacement || raw.displacement || {};
      const xD = parseFloat(rawDisp.xDisplacement_mm ?? latestDbRec.xDisplacement ?? 0.0) || 0.0;
      const yD = parseFloat(rawDisp.yDisplacement_mm ?? latestDbRec.yDisplacement ?? 0.0) || 0.0;
      const zD = parseFloat(rawDisp.zDisplacement_mm ?? latestDbRec.zDisplacement ?? 0.0) || 0.0;
      const totD = parseFloat(rawDisp.totalDisplacement_mm ?? latestDbRec.totalDisplacement ?? 0.0) || Math.sqrt(xD * xD + yD * yD + zD * zD);

      const rawTemp = latestDbRec.temperature ?? raw.environment?.temperature;
      const temp = rawTemp !== undefined && rawTemp !== null && !isNaN(parseFloat(rawTemp)) ? parseFloat(rawTemp) : null;

      return reply.send({
        statusCode: 200,
        deviceId,
        latest: {
          timestamp: new Date(latestDbRec.timestamp).toISOString(),
          time: new Date(latestDbRec.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          deviceId,
          presentX: rawX,
          presentY: rawY,
          presentZ: rawZ,
          roll: rawX,
          pitch: rawY,
          yaw: rawZ,
          xTilt: rawX,
          yTilt: rawY,
          zTilt: rawZ,
          resultantTilt: calcRes,
          deltaX,
          deltaY,
          deltaZ,
          refX,
          refY,
          refZ,
          xDisp: xD,
          yDisp: yD,
          zDisp: zD,
          totalDisp: totD,
          temperature: temp,
          temp,
          acceleration: latestDbRec.acceleration || raw.acceleration || null,
          gyroscope: latestDbRec.gyroscope || raw.gyroscope || null,
          vibration: latestDbRec.vibration || raw.vibration || null,
          rawPayload: raw,
        }
      });
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  });
}
