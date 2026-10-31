import { Device, TelemetryRecord } from '../models/index.js';

// In-memory ring buffer cache for live telemetry
export const inMemoryTelemetryStore = new Map();

/**
 * Helper to ensure empty objects {} are stored as null in PostgreSQL JSONB
 */
const nonEmpty = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return Object.keys(obj).length > 0 ? obj : null;
};

/**
 * Safely parse numbers from numeric/string/null inputs
 */
const parseNum = (v) => {
  if (v === null || v === undefined || v === '' || v === '--') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return !isNaN(n) ? n : null;
};

/**
 * Safely parse integers to prevent NaN bigint errors in PostgreSQL
 */
const parseInteger = (v) => {
  if (v === null || v === undefined || v === '' || v === '--') return null;
  const n = parseInt(v, 10);
  return !isNaN(n) ? n : null;
};

/**
 * Saves incoming telemetry cleanly into PostgreSQL and in-memory ring buffer.
 * Fully destructures all fields with complete fallback chains and stores rawPayload intact.
 */
export async function saveTelemetryPoint(data) {
  if (!data) return null;

  // Determine raw payload and device identity
  let rawPayload = data.rawPayload || data;
  if (typeof rawPayload === 'string') {
    try {
      rawPayload = JSON.parse(rawPayload);
    } catch (_) {
      rawPayload = { raw: rawPayload };
    }
  }

  const deviceId =
    data.deviceId ||
    data.device_id ||
    rawPayload.device_id ||
    rawPayload.deviceId ||
    rawPayload.id ||
    null;

  if (!deviceId) return null;

  const schemaVersion = parseInteger(rawPayload.schemaVersion ?? data.schemaVersion) ?? 2;
  const sampleUptimeMs = parseInteger(rawPayload.sampleUptimeMs ?? data.sampleUptimeMs);

  // ── Sensor Groups ────────────────────────────────────────────────────────
  const angleDelta        = rawPayload.angleDelta        || data.angleDelta        || {};
  const tilt              = rawPayload.tilt              || data.tilt              || {};
  const angleCurrent      = rawPayload.angleCurrent      || data.angleCurrent      || {};
  const angleReference    = rawPayload.angleReference    || data.angleReference    || {};
  const rawDisp           = rawPayload.displacement      || data.displacement      || {};
  const acceleration      = nonEmpty(rawPayload.acceleration      || data.acceleration);
  const accelerationCurrent   = nonEmpty(rawPayload.accelerationCurrent   || data.accelerationCurrent);
  const accelerationReference = nonEmpty(rawPayload.accelerationReference || data.accelerationReference);
  const accelerationDelta     = nonEmpty(rawPayload.accelerationDelta     || data.accelerationDelta);
  const gyroscope         = nonEmpty(rawPayload.gyroscope         || data.gyroscope);
  const vibration         = nonEmpty(rawPayload.vibration         || data.vibration);
  const environment       = nonEmpty(rawPayload.environment       || data.environment);
  const power             = nonEmpty(rawPayload.power             || data.power);
  const network           = nonEmpty(rawPayload.network           || data.network);
  const calibration       = nonEmpty(rawPayload.calibration       || data.calibration);
  const rockfallAlarm     = nonEmpty(rawPayload.rockfallAlarm     || data.rockfallAlarm);
  const motionEvent       = nonEmpty(rawPayload.motionEvent       || data.motionEvent);
  const monitoringSettings = nonEmpty(rawPayload.monitoringSettings || data.monitoringSettings);
  const units             = nonEmpty(rawPayload.units             || data.units);

  // ── Destructure Angles (prefer precomputed data → angleDelta → tilt → flat) ──
  const xTilt = parseNum(
    data.xTilt ?? data.roll ?? angleDelta.x ?? tilt.roll ?? tilt.x ?? tilt.tiltX ?? rawPayload.xTilt ?? rawPayload.roll ?? rawPayload.x
  );
  const yTilt = parseNum(
    data.yTilt ?? data.pitch ?? angleDelta.y ?? tilt.pitch ?? tilt.y ?? tilt.tiltY ?? rawPayload.yTilt ?? rawPayload.pitch ?? rawPayload.y
  );
  const zTilt = parseNum(
    data.zTilt ?? data.yaw ?? angleDelta.z ?? tilt.yaw ?? tilt.z ?? tilt.tiltZ ?? rawPayload.zTilt ?? rawPayload.yaw ?? rawPayload.z
  );
  const yaw = zTilt;
  const resultantTilt = parseNum(
    data.resultantTilt ?? tilt.tilt ?? tilt.resultantTilt ?? rawPayload.resultantTilt ?? rawPayload.tilt
  ) ?? (xTilt !== null && yTilt !== null ? Math.sqrt(xTilt * xTilt + yTilt * yTilt) : null);

  // ── Destructure Displacement ─────────────────────────────────────────────
  const xDisplacement = parseNum(
    data.xDisplacement ?? data.xDisp ?? rawDisp.xDisplacement_mm ?? rawDisp.xDisplacement ?? rawDisp.xDisp ?? rawDisp.x ?? rawPayload.xDisplacement ?? rawPayload.xDisp
  );
  const yDisplacement = parseNum(
    data.yDisplacement ?? data.yDisp ?? rawDisp.yDisplacement_mm ?? rawDisp.yDisplacement ?? rawDisp.yDisp ?? rawDisp.y ?? rawPayload.yDisplacement ?? rawPayload.yDisp
  );
  const zDisplacement = parseNum(
    data.zDisplacement ?? data.zDisp ?? rawDisp.zDisplacement_mm ?? rawDisp.zDisplacement ?? rawDisp.zDisp ?? rawDisp.z ?? rawPayload.zDisplacement ?? rawPayload.zDisp
  );
  const totalDisplacement = parseNum(
    data.totalDisplacement ?? data.totalDisp ?? rawDisp.totalDisplacement_mm ?? rawDisp.totalDisplacement ?? rawDisp.totalDisp ?? rawPayload.totalDisplacement ?? rawPayload.totalDisp
  ) ?? (xDisplacement !== null && yDisplacement !== null ? Math.sqrt(xDisplacement * xDisplacement + yDisplacement * yDisplacement + (zDisplacement || 0) * (zDisplacement || 0)) : null);

  // ── Temperature, Battery, CSQ ───────────────────────────────────────────
  const rawEnvTemp =
    data.temperature ?? data.temp ?? data.tempVal ?? rawPayload.environment?.temperature ?? rawPayload.environment?.temp ?? rawPayload.temperature ?? rawPayload.temp;
  const tempVal = parseNum(rawEnvTemp);

  const rawPowerBat =
    data.batteryVoltage ?? data.battery ?? rawPayload.power?.batteryVoltage ?? rawPayload.power?.battery ?? rawPayload.batteryVoltage ?? rawPayload.battery;
  const batteryVoltage = parseNum(rawPowerBat);

  const rawNetCsq =
    data.csq ?? data.signalStrength ?? rawPayload.network?.csq ?? rawPayload.csq ?? rawPayload.signalStrength ?? rawPayload.rssi;
  const csq = parseInteger(rawNetCsq);

  // ── Hazard, Vibration & Motion ───────────────────────────────────────────
  const rockfallDeltaPeak =
    typeof accelerationDelta?.peak === 'number'
      ? accelerationDelta.peak
      : (typeof data.rockfallDeltaPeak === 'number' ? data.rockfallDeltaPeak : null);

  const touchVibrationPeak =
    typeof vibration?.vibrationPeak === 'number'
      ? vibration.vibrationPeak
      : (typeof data.touchVibrationPeak === 'number' ? data.touchVibrationPeak : (typeof vibration?.vibration === 'number' ? vibration.vibration : null));

  const vibrationRMS =
    typeof vibration?.vibrationRMS === 'number'
      ? vibration.vibrationRMS
      : (typeof data.vibrationRMS === 'number' ? data.vibrationRMS : null);

  const motionClassification =
    motionEvent?.classification || data.motionClassification || rawPayload.motionClassification || 'STABLE';
  const alarmActive = Boolean(rockfallAlarm?.active ?? data.alarmActive ?? rawPayload.alarmActive ?? false);
  const eventPending = Boolean(motionEvent?.pending ?? data.eventPending ?? rawPayload.eventPending ?? false);

  const validTimestamp = data.timestamp ? new Date(data.timestamp) : new Date();
  const safeTimestamp = !isNaN(validTimestamp.getTime()) ? validTimestamp : new Date();
  const isoTimestamp = safeTimestamp.toISOString();

  // Clean rawPayload to store intact as JSON
  const cleanRawPayload = typeof rawPayload === 'object' && rawPayload !== null ? rawPayload : { raw: rawPayload };

  // 1. Ensure Device exists in PostgreSQL devices table and update latest state
  try {
    const [deviceInstance] = await Device.findOrCreate({
      where: { id: deviceId },
      defaults: {
        id: deviceId,
        name: data.name || `Tiltmeter ${deviceId}`,
        xTilt,
        yTilt,
        zTilt,
        yaw,
        resultantTilt,
        xDisplacement,
        yDisplacement,
        totalDisplacement,
        temperature: tempVal,
        battery: batteryVoltage !== null ? `${batteryVoltage} V` : null,
        signalStrength: csq !== null ? `${csq} CSQ` : null,
        status: alarmActive ? 'ALARM' : (tilt.tiltStatus || 'ONLINE'),
        lastSeen: safeTimestamp,
        schemaVersion,
        motionClassification,
        alarmActive,
        rockfallDeltaPeak,
        vibrationPeak: touchVibrationPeak,
        monitoringSettings,
      },
    });

    await deviceInstance.update({
      xTilt: xTilt ?? deviceInstance.xTilt,
      yTilt: yTilt ?? deviceInstance.yTilt,
      zTilt: zTilt ?? deviceInstance.zTilt,
      yaw: yaw ?? deviceInstance.yaw,
      resultantTilt: resultantTilt ?? deviceInstance.resultantTilt,
      xDisplacement: xDisplacement ?? deviceInstance.xDisplacement,
      yDisplacement: yDisplacement ?? deviceInstance.yDisplacement,
      totalDisplacement: totalDisplacement ?? deviceInstance.totalDisplacement,
      temperature: tempVal ?? deviceInstance.temperature,
      battery: batteryVoltage !== null ? `${batteryVoltage} V` : deviceInstance.battery,
      signalStrength: csq !== null ? `${csq} CSQ` : deviceInstance.signalStrength,
      status: alarmActive ? 'ALARM' : (tilt.tiltStatus || deviceInstance.status || 'ONLINE'),
      lastSeen: safeTimestamp,
      schemaVersion,
      motionClassification: motionClassification || deviceInstance.motionClassification,
      alarmActive,
      rockfallDeltaPeak: rockfallDeltaPeak ?? deviceInstance.rockfallDeltaPeak,
      vibrationPeak: touchVibrationPeak ?? deviceInstance.vibrationPeak,
      monitoringSettings: monitoringSettings || deviceInstance.monitoringSettings,
    });

    // 2. Persist directly into PostgreSQL TelemetryRecord table
    const recordPayload = {
      deviceId,
      schemaVersion,
      sampleUptimeMs,
      timestamp: safeTimestamp,
      xTilt,
      yTilt,
      zTilt,
      yaw,
      resultantTilt,
      xDisplacement,
      yDisplacement,
      zDisplacement,
      totalDisplacement,
      temperature: tempVal,
      batteryVoltage,
      csq,
      rockfallDeltaPeak,
      touchVibrationPeak,
      vibrationRMS,
      motionClassification,
      alarmActive,
      eventPending,
      acceleration,
      accelerationCurrent,
      accelerationReference,
      accelerationDelta,
      gyroscope,
      tilt: nonEmpty(tilt),
      angleReference: nonEmpty(angleReference),
      angleCurrent: nonEmpty(angleCurrent),
      angleDelta: nonEmpty(angleDelta),
      vibration,
      displacement: nonEmpty(rawDisp),
      environment,
      power,
      network,
      calibration,
      rockfallAlarm,
      motionEvent,
      monitoringSettings,
      units,
      rawPayload: cleanRawPayload,
    };

    try {
      await TelemetryRecord.create(recordPayload);
    } catch (createErr) {
      if (createErr.name === 'SequelizeUniqueConstraintError') {
        await TelemetryRecord.update(recordPayload, {
          where: { deviceId, timestamp: safeTimestamp },
        });
      } else {
        throw createErr;
      }
    }
  } catch (err) {
    console.warn(`[PostgreSQL Telemetry Warning] Database update for ${deviceId}:`, err.message);
  }

  // 3. Keep in-memory cache ring buffer for live dashboard & WebSocket subscribers
  if (!inMemoryTelemetryStore.has(deviceId)) {
    inMemoryTelemetryStore.set(deviceId, []);
  }
  const deviceHistory = inMemoryTelemetryStore.get(deviceId);
  const cachedPoint = {
    time: safeTimestamp.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    timestamp: isoTimestamp,
    deviceId,
    schemaVersion,
    sampleUptimeMs,
    xTilt,
    yTilt,
    zTilt,
    yaw,
    resultantTilt,
    xDisp: xDisplacement,
    yDisp: yDisplacement,
    zDisp: zDisplacement,
    totalDisp: totalDisplacement,
    xDisplacement,
    yDisplacement,
    zDisplacement,
    totalDisplacement,
    temperature: tempVal,
    batteryVoltage,
    csq,
    rockfallDeltaPeak,
    touchVibrationPeak,
    vibrationRMS,
    motionClassification,
    alarmActive,
    eventPending,
    acceleration,
    accelerationCurrent,
    accelerationReference,
    accelerationDelta,
    gyroscope,
    tilt: nonEmpty(tilt),
    angleReference: nonEmpty(angleReference),
    angleCurrent: nonEmpty(angleCurrent),
    angleDelta: nonEmpty(angleDelta),
    vibration,
    displacement: nonEmpty(rawDisp),
    environment,
    power,
    network,
    calibration,
    rockfallAlarm,
    motionEvent,
    monitoringSettings,
    units,
    rawPayload: cleanRawPayload,
    ...data,
  };

  deviceHistory.push(cachedPoint);
  if (deviceHistory.length > 500) {
    deviceHistory.shift();
  }

  return true;
}

