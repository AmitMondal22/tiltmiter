import { saveTelemetryPoint } from '../../services/telemetryStore.js';
import { broadcastTelemetry } from '../../websocket/websocket.service.js';
import { evaluateTelemetryAlerts } from '../../services/alertEngineService.js';
import { Device } from '../../models/Device.js';

/**
 * Returns the object if it has at least one own key, otherwise null.
 * Prevents empty {} being stored in JSONB columns instead of null.
 */
const nonEmpty = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return Object.keys(obj).length > 0 ? obj : null;
};

/**
 * Safely parse a number. Returns null for undefined / '' / '--' / NaN.
 */
const parseNum = (v) => {
  if (v === null || v === undefined || v === '' || v === '--') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return !isNaN(n) ? n : null;
};

/**
 * Safely parse an integer. Returns null for undefined / '' / '--' / NaN (prevents PostgreSQL NaN bigint errors).
 */
const parseInteger = (v) => {
  if (v === null || v === undefined || v === '' || v === '--') return null;
  const n = parseInt(v, 10);
  return !isNaN(n) ? n : null;
};

export async function processAndSaveTelemetry(rawPayload, params = {}) {
  // ── Device Identity ──────────────────────────────────────────────────────
  const deviceId =
    rawPayload.device_id || rawPayload.deviceId || params.deviceId || null;

  if (!deviceId) {
    throw new Error('Device ID is required in telemetry payload or URL parameters');
  }

  // ── Destructure nested sensor groups ────────────────────────────────────
  // Use inner object for reading scalars; store null for absent/empty groups.
  const _angleDelta     = rawPayload.angleDelta     || {};
  const _tilt           = rawPayload.tilt           || {};
  const _displacement   = rawPayload.displacement   || {};
  const _environment    = rawPayload.environment    || {};
  const _power          = rawPayload.power          || {};
  const _network        = rawPayload.network        || {};
  const _accelerationDelta = rawPayload.accelerationDelta || {};
  const _vibration      = rawPayload.vibration      || {};
  const _rockfallAlarm  = rawPayload.rockfallAlarm  || {};
  const _motionEvent    = rawPayload.motionEvent    || {};

  // JSONB groups — stored as null when absent or empty
  const acceleration          = nonEmpty(rawPayload.acceleration);
  const accelerationCurrent   = nonEmpty(rawPayload.accelerationCurrent);
  const accelerationReference = nonEmpty(rawPayload.accelerationReference);
  const accelerationDelta     = nonEmpty(rawPayload.accelerationDelta);
  const gyroscope             = nonEmpty(rawPayload.gyroscope);
  const vibration             = nonEmpty(rawPayload.vibration);
  const tilt                  = nonEmpty(rawPayload.tilt);
  const angleDelta            = nonEmpty(rawPayload.angleDelta);
  const angleCurrent          = nonEmpty(rawPayload.angleCurrent);
  const angleReference        = nonEmpty(rawPayload.angleReference);
  const displacement          = nonEmpty(rawPayload.displacement);
  const environment           = nonEmpty(rawPayload.environment);
  const power                 = nonEmpty(rawPayload.power);
  const network               = nonEmpty(rawPayload.network);
  const calibration           = nonEmpty(rawPayload.calibration);
  const rockfallAlarm         = nonEmpty(rawPayload.rockfallAlarm);
  const motionEvent           = nonEmpty(rawPayload.motionEvent);
  const monitoringSettings    = nonEmpty(rawPayload.monitoringSettings);
  const units                 = nonEmpty(rawPayload.units);

  // ── Flat tilt / angle values ─────────────────────────────────────────────
  // Priority: schema-v2 angleDelta → tilt object → top-level flat keys
  const xTilt = parseNum(
    _angleDelta.x ?? _tilt.roll  ?? rawPayload.xTilt ?? rawPayload.roll
  );
  const yTilt = parseNum(
    _angleDelta.y ?? _tilt.pitch ?? rawPayload.yTilt ?? rawPayload.pitch
  );
  const zTilt = parseNum(
    _angleDelta.z ?? _tilt.yaw   ?? rawPayload.zTilt ?? rawPayload.yaw
  );
  const resultantTilt =
    parseNum(_tilt.tilt ?? rawPayload.resultantTilt) ??
    (xTilt !== null && yTilt !== null
      ? Math.sqrt(xTilt * xTilt + yTilt * yTilt)
      : null);

  // ── Displacement (mm) ────────────────────────────────────────────────────
  const xDisplacement = parseNum(
    _displacement.xDisplacement_mm ?? rawPayload.xDisplacement ?? rawPayload.xDisp
  );
  const yDisplacement = parseNum(
    _displacement.yDisplacement_mm ?? rawPayload.yDisplacement ?? rawPayload.yDisp
  );
  const zDisplacement = parseNum(
    _displacement.zDisplacement_mm ?? rawPayload.zDisplacement ?? rawPayload.zDisp
  );
  const totalDisplacement =
    parseNum(_displacement.totalDisplacement_mm ?? rawPayload.totalDisplacement ?? rawPayload.totalDisp) ??
    (xDisplacement !== null && yDisplacement !== null
      ? Math.sqrt(
          xDisplacement * xDisplacement +
          yDisplacement * yDisplacement +
          (zDisplacement || 0) * (zDisplacement || 0)
        )
      : null);

  // ── Environment / Power / Network scalars ────────────────────────────────
  const temperature    = parseNum(_environment.temperature ?? rawPayload.temperature ?? rawPayload.temp);
  const batteryVoltage = parseNum(_power.batteryVoltage    ?? rawPayload.batteryVoltage ?? rawPayload.battery);
  const csq            = parseNum(_network.csq             ?? rawPayload.csq ?? rawPayload.signalStrength);

  // ── Motion / Alarm derived scalars ───────────────────────────────────────
  const rockfallDeltaPeak  = typeof _accelerationDelta.peak === 'number' ? _accelerationDelta.peak : null;
  const touchVibrationPeak = typeof _vibration.vibrationPeak === 'number' ? _vibration.vibrationPeak : null;
  const vibrationRMS       = typeof _vibration.vibrationRMS  === 'number' ? _vibration.vibrationRMS  : null;
  const motionClassification = _motionEvent.classification || rawPayload.motionClassification || 'STABLE';
  const alarmActive          = Boolean(_rockfallAlarm.active ?? rawPayload.alarmActive);
  const eventPending         = Boolean(_motionEvent.pending  ?? rawPayload.eventPending);

  // ── Timestamp ────────────────────────────────────────────────────────────
  let utcTimestamp;
  if (rawPayload.timestamp) {
    const parsed = new Date(rawPayload.timestamp);
    utcTimestamp = !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  } else {
    utcTimestamp = new Date().toISOString();
  }

  // ── Composed telemetry object ────────────────────────────────────────────
  const telemetryData = {
    // Exact unaltered raw payload stored intact for audit
    rawPayload,

    // Identity & meta
    deviceId,
    device_id: deviceId,
    schemaVersion:  parseInteger(rawPayload.schemaVersion) ?? 2,
    sampleUptimeMs: parseInteger(rawPayload.sampleUptimeMs),
    timestamp:      utcTimestamp,

    // Flat tilt / angle metrics
    xTilt,
    yTilt,
    zTilt,
    yaw:          zTilt,
    resultantTilt,
    roll:         xTilt,
    pitch:        yTilt,

    // Flat displacement metrics (mm)
    xDisplacement,
    yDisplacement,
    zDisplacement,
    totalDisplacement,
    xDisp:        xDisplacement,
    yDisp:        yDisplacement,
    zDisp:        zDisplacement,
    totalDisp:    totalDisplacement,

    // Scalar environment / power / network
    temperature,
    temp:         temperature,
    batteryVoltage,
    csq,

    // Derived alarm / motion scalars
    rockfallDeltaPeak,
    touchVibrationPeak,
    vibrationRMS,
    motionClassification,
    alarmActive,
    eventPending,

    // Nested JSONB groups (null when absent/empty in payload)
    acceleration,
    accelerationCurrent,
    accelerationReference,
    accelerationDelta,
    gyroscope,
    tilt,
    angleReference,
    angleCurrent,
    angleDelta,
    vibration,
    displacement,
    environment,
    power,
    network,
    calibration,
    rockfallAlarm,
    motionEvent,
    monitoringSettings,
    units,
  };

  // 1. Save to PostgreSQL + in-memory ring buffer
  await saveTelemetryPoint(telemetryData);
  console.log(
    `💾 [TELEMETRY STORED] Device: ${deviceId} | Time: ${utcTimestamp} | ` +
    `xTilt: ${xTilt ?? '--'} | yTilt: ${yTilt ?? '--'} | temp: ${temperature ?? '--'} | ` +
    `bat: ${batteryVoltage ?? '--'} V | csq: ${csq ?? '--'} | ` +
    `Class: ${motionClassification} | Alarm: ${alarmActive} | ΔPeak: ${rockfallDeltaPeak ?? '--'}`
  );

  // 2. Broadcast to WebSocket subscribers
  broadcastTelemetry(telemetryData);

  // 3. Evaluate alert rules (non-blocking)
  try {
    const defaultDevice = { id: deviceId, deviceId, name: `Inclinometer ${deviceId}` };
    evaluateTelemetryAlerts(defaultDevice, telemetryData).catch(() => {});
  } catch (e) {}

  return { deviceId, timestamp: utcTimestamp, data: telemetryData };
}
