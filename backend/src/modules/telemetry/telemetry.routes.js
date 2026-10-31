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

    // Handle range shortcuts if provided (e.g. 1h, 6h, 12h, 24h, 7d, 30d, all) anchored to latest device data
    if (range && String(range).toLowerCase() !== 'custom') {
      let refDate = null;
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

      const rLower = String(range).toLowerCase();
      if (rLower === 'all') {
        startDate = null;
        stopDate = null;
      } else {
        let durationMs = 24 * 60 * 60 * 1000;
        if (rLower === '1h') durationMs = 60 * 60 * 1000;
        else if (rLower === '6h') durationMs = 6 * 60 * 60 * 1000;
        else if (rLower === '12h') durationMs = 12 * 60 * 60 * 1000;
        else if (rLower === '24h' || rLower === '1d') durationMs = 24 * 60 * 60 * 1000;
        else if (rLower === '7d' || rLower === '1w') durationMs = 7 * 24 * 60 * 60 * 1000;
        else if (rLower === '30d' || rLower === '1m') durationMs = 30 * 24 * 60 * 60 * 1000;

        const nowMs = Date.now();
        // Anchor to latest record timestamp so data points within durationMs are never cut off prematurely
        let anchorTime = nowMs;
        if (refDate && !isNaN(refDate.getTime())) {
          anchorTime = refDate.getTime();
        }
        startDate = new Date(anchorTime - durationMs);
        stopDate = null; // Do not cap upper bound so newly ingested points are never filtered out
      }
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

    const parseNum = (v) => {
      if (v === null || v === undefined || v === '' || v === '--') return null;
      const n = typeof v === 'number' ? v : parseFloat(v);
      return !isNaN(n) ? n : null;
    };

    // Helper to extract sensor values from rawPayload nested structure or flat fields
    const extractFromRecord = (r) => {
      const raw = r.rawPayload || {};
      // Acceleration - return null if not reported
      const ax = parseNum(raw.acceleration?.ax ?? raw.acceleration?.axG ?? r.acceleration?.ax ?? r.ax ?? r.axG);
      const ay = parseNum(raw.acceleration?.ay ?? raw.acceleration?.ayG ?? r.acceleration?.ay ?? r.ay ?? r.ayG);
      const az = parseNum(raw.acceleration?.az ?? raw.acceleration?.azG ?? r.acceleration?.az ?? r.az ?? r.azG);
      const axG = ax;
      const ayG = ay;
      const azG = az;
      const accMag = parseNum(raw.acceleration?.accMag ?? r.acceleration?.accMag ?? (ax !== null && ay !== null && az !== null ? Math.sqrt(ax*ax + ay*ay + az*az) : null));

      // Vibration
      const vibRMS = parseNum(raw.vibration?.vibrationRMS ?? raw.vibration?.vibration ?? r.vibration?.vibrationRMS ?? r.vibration?.vibration);
      const vibPeak = parseNum(raw.vibration?.vibrationPeak ?? r.vibration?.vibrationPeak);

      // Temperature - stored as number in DB
      const rawEnvTemp = r.temperature ?? raw.environment?.temperature;
      const temperature = parseNum(rawEnvTemp);

      return { ax, ay, az, axG, ayG, azG, accMag, vibRMS, vibPeak, temperature };
    };

    // Helper to format every point ensuring calibration data is correctly applied
    const formatPoint = (pt, extracted = null) => {
      const raw = pt.rawPayload || {};
      const rawX = parseNum(pt.xTilt ?? pt.tiltX ?? pt.roll ?? raw.tilt?.roll ?? raw.angleDelta?.x);
      const rawY = parseNum(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? raw.tilt?.pitch ?? raw.angleDelta?.y);
      const rawZ = parseNum(pt.yaw ?? pt.zTilt ?? pt.tiltZ ?? raw.tilt?.yaw ?? raw.tilt?.zTilt ?? raw.angleDelta?.z);
      const rawRes = parseNum(pt.resultant ?? pt.resultantTilt ?? pt.tilt ?? raw.tilt?.tilt);
      const calcRes = rawRes !== null ? rawRes : (rawX !== null && rawY !== null ? Math.sqrt(rawX * rawX + rawY * rawY) : null);

      // Present Values = Pure actual device values (null if not sent)
      const presentX = rawX;
      const presentY = rawY;
      const presentZ = rawZ;
      const presentResultant = calcRes;

      const deltaThetaX = rawX;
      const deltaThetaY = rawY;
      const deltaThetaZ = rawZ;

      // Device-provided displacement data
      const rawDisp = pt.displacement || raw.displacement || {};
      const devXDisp = parseNum(rawDisp.xDisplacement_mm ?? pt.xDisplacement_mm ?? pt.xDisplacement ?? pt.xDisp);
      const devYDisp = parseNum(rawDisp.yDisplacement_mm ?? pt.yDisplacement_mm ?? pt.yDisplacement ?? pt.yDisp);
      const devZDisp = parseNum(rawDisp.zDisplacement_mm ?? pt.zDisplacement_mm ?? pt.zDisplacement ?? pt.zDisp);
      const devTotDisp = parseNum(rawDisp.totalDisplacement_mm ?? pt.totalDisplacement_mm ?? pt.totalDisplacement ?? pt.totalDisp);

      const finalXDisp = devXDisp;
      const finalYDisp = devYDisp;
      const finalZDisp = devZDisp;
      const finalTotalDisp = devTotDisp !== null ? devTotDisp : (finalXDisp !== null && finalYDisp !== null ? Math.sqrt(finalXDisp * finalXDisp + finalYDisp * finalYDisp + (finalZDisp || 0) * (finalZDisp || 0)) : null);

      // Use extracted sensor values (no dummy fallbacks - null means no data)
      const sensors = extracted || {};
      const axG = sensors.axG ?? parseNum(pt.axG ?? pt.ax);
      const ayG = sensors.ayG ?? parseNum(pt.ayG ?? pt.ay);
      const azG = sensors.azG ?? parseNum(pt.azG ?? pt.az);
      const accMag = sensors.accMag ?? parseNum(pt.accMag);
      const vibRMS = sensors.vibRMS ?? parseNum(pt.vibRMS ?? pt.vibrationRMS);
      const vibPeak = sensors.vibPeak ?? parseNum(pt.vibPeak ?? pt.vibrationPeak);
      const rawPtTemp = sensors.temperature ?? pt.temp ?? pt.temperature ?? raw.environment?.temperature;
      const temperature = parseNum(rawPtTemp);

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

        // Delta Values
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

        xDisp: finalXDisp !== null ? Number(finalXDisp.toFixed(3)) : null,
        xDisplacement: finalXDisp !== null ? Number(finalXDisp.toFixed(3)) : null,
        yDisp: finalYDisp !== null ? Number(finalYDisp.toFixed(3)) : null,
        yDisplacement: finalYDisp !== null ? Number(finalYDisp.toFixed(3)) : null,
        zDisp: finalZDisp !== null ? Number(finalZDisp.toFixed(3)) : null,
        zDisplacement: finalZDisp !== null ? Number(finalZDisp.toFixed(3)) : null,
        totalDisp: finalTotalDisp !== null ? Number(finalTotalDisp.toFixed(3)) : null,
        totalDisplacement: finalTotalDisp !== null ? Number(finalTotalDisp.toFixed(3)) : null,
        xDisplacement_mm: finalXDisp !== null ? Number(finalXDisp.toFixed(4)) : null,
        yDisplacement_mm: finalYDisp !== null ? Number(finalYDisp.toFixed(4)) : null,
        zDisplacement_mm: finalZDisp !== null ? Number(finalZDisp.toFixed(4)) : null,
        totalDisplacement_mm: finalTotalDisp !== null ? Number(finalTotalDisp.toFixed(4)) : null,
        displacement: {
          xDisplacement_mm: finalXDisp !== null ? Number(finalXDisp.toFixed(4)) : null,
          yDisplacement_mm: finalYDisp !== null ? Number(finalYDisp.toFixed(4)) : null,
          zDisplacement_mm: finalZDisp !== null ? Number(finalZDisp.toFixed(4)) : null,
          totalDisplacement_mm: finalTotalDisp !== null ? Number(finalTotalDisp.toFixed(4)) : null,
        },
        // Full Schema v2 Destructured and Raw Payload Data
        schemaVersion: pt.schemaVersion ?? raw.schemaVersion ?? 2,
        sampleUptimeMs: pt.sampleUptimeMs ?? raw.sampleUptimeMs ?? null,
        acceleration: pt.acceleration || raw.acceleration || null,
        accelerationCurrent: pt.accelerationCurrent || raw.accelerationCurrent || null,
        accelerationReference: pt.accelerationReference || raw.accelerationReference || null,
        accelerationDelta: pt.accelerationDelta || raw.accelerationDelta || null,
        gyroscope: pt.gyroscope || raw.gyroscope || null,
        tilt: pt.tilt || raw.tilt || null,
        angleReference: pt.angleReference || raw.angleReference || null,
        angleCurrent: pt.angleCurrent || raw.angleCurrent || null,
        angleDelta: pt.angleDelta || raw.angleDelta || null,
        vibration: pt.vibration || raw.vibration || null,
        environment: pt.environment || raw.environment || null,
        power: pt.power || raw.power || null,
        network: pt.network || raw.network || null,
        calibration: pt.calibration || raw.calibration || null,
        rockfallAlarm: pt.rockfallAlarm || raw.rockfallAlarm || null,
        motionEvent: pt.motionEvent || raw.motionEvent || null,
        monitoringSettings: pt.monitoringSettings || raw.monitoringSettings || null,
        units: pt.units || raw.units || null,
        rawPayload: pt.rawPayload || raw || null,

        rockfallDeltaPeak: pt.rockfallDeltaPeak ?? raw.accelerationDelta?.peak ?? null,
        touchVibrationPeak: pt.touchVibrationPeak ?? raw.vibration?.vibrationPeak ?? null,
        vibrationPeak: vibPeak !== null && !isNaN(vibPeak) ? Number(vibPeak.toFixed(4)) : (pt.touchVibrationPeak ?? raw.vibration?.vibrationPeak ?? null),
        vibrationRMS: vibRMS !== null && !isNaN(vibRMS) ? Number(vibRMS.toFixed(4)) : (raw.vibration?.vibrationRMS ?? null),
        motionClassification: pt.motionClassification ?? raw.motionEvent?.classification ?? 'STABLE',
        alarmActive: Boolean(pt.alarmActive ?? raw.rockfallAlarm?.active ?? false),
        eventPending: Boolean(pt.eventPending ?? raw.motionEvent?.pending ?? false),

        battery: raw.power?.batteryVoltage !== undefined ? `${raw.power.batteryVoltage} V` : (pt.batteryVoltage !== null && pt.batteryVoltage !== undefined ? `${pt.batteryVoltage} V` : null),
        batteryVoltage: raw.power?.batteryVoltage ?? pt.batteryVoltage ?? null,
        csq: raw.network?.csq ?? pt.csq ?? null,
        signalStrength: raw.network?.csq !== undefined ? `${raw.network.csq} CSQ` : (pt.csq !== null && pt.csq !== undefined ? `${pt.csq} CSQ` : null),
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
          latest: latestPoint || (history.length > 0 ? history[history.length - 1] : null),
        });
      }
    } catch (err) {
      fastify.log.warn({ err }, '[Telemetry] PostgreSQL query error: ' + (err?.message || err));
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
    } catch (e) {
      fastify.log.warn({ err: e }, '[Telemetry] Fallback query error: ' + (e?.message || e));
    }

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
      const rawX = parseNum(latestDbRec.xTilt ?? raw.tilt?.roll ?? raw.roll);
      const rawY = parseNum(latestDbRec.yTilt ?? raw.tilt?.pitch ?? raw.pitch);
      const rawZ = parseNum(latestDbRec.zTilt ?? latestDbRec.yaw ?? raw.tilt?.yaw ?? raw.yaw);
      const calcRes = (rawX !== null && rawY !== null) ? Math.sqrt(rawX * rawX + rawY * rawY) : null;

      // Pure device angle values directly without logic change
      const deltaX = rawX;
      const deltaY = rawY;
      const deltaZ = rawZ;

      const rawDisp = latestDbRec.displacement || raw.displacement || {};
      const xD = parseNum(rawDisp.xDisplacement_mm ?? latestDbRec.xDisplacement ?? latestDbRec.xDisp);
      const yD = parseNum(rawDisp.yDisplacement_mm ?? latestDbRec.yDisplacement ?? latestDbRec.yDisp);
      const zD = parseNum(rawDisp.zDisplacement_mm ?? latestDbRec.zDisplacement ?? latestDbRec.zDisp);
      const totD = parseNum(rawDisp.totalDisplacement_mm ?? latestDbRec.totalDisplacement ?? latestDbRec.totalDisp) ?? (xD !== null && yD !== null ? Math.sqrt(xD * xD + yD * yD + (zD || 0) * (zD || 0)) : null);

      const rawTemp = latestDbRec.temperature ?? raw.environment?.temperature;
      const temp = parseNum(rawTemp);

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
