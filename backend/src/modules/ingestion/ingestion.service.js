import { saveTelemetryPoint } from '../../services/telemetryStore.js';
import { broadcastTelemetry } from '../../websocket/websocket.service.js';
import { evaluateTelemetryAlerts } from '../../services/alertEngineService.js';
import { Device } from '../../models/Device.js';

export async function processAndSaveTelemetry(rawPayload, params = {}) {
  // Device identity from payload or URL parameters (schema v2 uses device_id)
  const deviceId = rawPayload.device_id || rawPayload.deviceId || params.deviceId || null;
  if (!deviceId) {
    throw new Error('Device ID is required in telemetry payload or URL parameters');
  }

  const parseNum = (v) => {
    if (v === null || v === undefined || v === '' || v === '--') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return !isNaN(n) ? n : null;
  };

  // Sensor data is stored without changing any values (no artificial trigonometry, no artificial zero subtractions)
  const angleDelta = rawPayload.angleDelta || {};
  const tilt = rawPayload.tilt || {};
  const angleCurrent = rawPayload.angleCurrent || {};
  const angleReference = rawPayload.angleReference || {};
  const displacement = rawPayload.displacement || {};
  const acceleration = rawPayload.acceleration || {};
  const accelerationCurrent = rawPayload.accelerationCurrent || {};
  const accelerationReference = rawPayload.accelerationReference || {};
  const accelerationDelta = rawPayload.accelerationDelta || {};
  const gyroscope = rawPayload.gyroscope || {};
  const vibration = rawPayload.vibration || {};
  const environment = rawPayload.environment || {};
  const power = rawPayload.power || {};
  const network = rawPayload.network || {};
  const calibration = rawPayload.calibration || {};
  const rockfallAlarm = rawPayload.rockfallAlarm || {};
  const motionEvent = rawPayload.motionEvent || {};
  const monitoringSettings = rawPayload.monitoringSettings || {};
  const units = rawPayload.units || {};

  // Pure device angle values directly from payload
  const xTilt = parseNum(angleDelta.x ?? tilt.roll ?? rawPayload.xTilt);
  const yTilt = parseNum(angleDelta.y ?? tilt.pitch ?? rawPayload.yTilt);
  const zTilt = parseNum(angleDelta.z ?? tilt.yaw ?? rawPayload.zTilt);
  const resultantTilt = parseNum(tilt.tilt ?? rawPayload.resultantTilt) ?? (xTilt !== null && yTilt !== null ? Math.sqrt(xTilt * xTilt + yTilt * yTilt) : null);

  // Pure device displacement values directly from payload (mm)
  const xDisplacement = parseNum(displacement.xDisplacement_mm ?? rawPayload.xDisplacement ?? rawPayload.xDisp);
  const yDisplacement = parseNum(displacement.yDisplacement_mm ?? rawPayload.yDisplacement ?? rawPayload.yDisp);
  const zDisplacement = parseNum(displacement.zDisplacement_mm ?? rawPayload.zDisplacement ?? rawPayload.zDisp);
  const totalDisplacement = parseNum(displacement.totalDisplacement_mm ?? rawPayload.totalDisplacement ?? rawPayload.totalDisp) ?? (xDisplacement !== null && yDisplacement !== null ? Math.sqrt(xDisplacement * xDisplacement + yDisplacement * yDisplacement + (zDisplacement || 0) * (zDisplacement || 0)) : null);

  // Sensor environment, power, network
  const temperature = parseNum(environment.temperature ?? rawPayload.temperature ?? rawPayload.temp);
  const batteryVoltage = parseNum(power.batteryVoltage ?? rawPayload.batteryVoltage ?? rawPayload.battery);
  const csq = parseNum(network.csq ?? rawPayload.csq ?? rawPayload.signalStrength);

  // Time handling: use timestamp from payload if valid, otherwise current UTC time
  let utcTimestamp;
  if (rawPayload.timestamp) {
    const parsed = new Date(rawPayload.timestamp);
    utcTimestamp = !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  } else {
    utcTimestamp = new Date().toISOString();
  }

  const telemetryData = {
    // Exact unaltered raw payload stored intact
    rawPayload,

    deviceId,
    device_id: deviceId,
    schemaVersion: parseInt(rawPayload.schemaVersion ?? 2, 10),
    sampleUptimeMs: rawPayload.sampleUptimeMs !== undefined ? parseInt(rawPayload.sampleUptimeMs, 10) : null,
    timestamp: utcTimestamp,

    // Destructured individual metrics
    xTilt,
    yTilt,
    zTilt,
    yaw: zTilt,
    resultantTilt,
    roll: xTilt,
    pitch: yTilt,

    xDisplacement,
    yDisplacement,
    zDisplacement,
    totalDisplacement,
    xDisp: xDisplacement,
    yDisp: yDisplacement,
    zDisp: zDisplacement,
    totalDisp: totalDisplacement,

    temperature,
    temp: temperature,
    batteryVoltage,
    csq,

    rockfallDeltaPeak: typeof accelerationDelta.peak === 'number' ? accelerationDelta.peak : null,
    touchVibrationPeak: typeof vibration.vibrationPeak === 'number' ? vibration.vibrationPeak : null,
    vibrationRMS: typeof vibration.vibrationRMS === 'number' ? vibration.vibrationRMS : null,
    motionClassification: motionEvent.classification || 'STABLE',
    alarmActive: Boolean(rockfallAlarm.active),
    eventPending: Boolean(motionEvent.pending),

    // Destructured objects (Schema v2)
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

  // 1. Save directly into PostgreSQL and in-memory telemetry store
  await saveTelemetryPoint(telemetryData);
  console.log(`💾 [TELEMETRY STORED] Device: ${deviceId} | Time: ${utcTimestamp} | Class: ${telemetryData.motionClassification} | Alarm: ${telemetryData.alarmActive} | ΔPeak: ${telemetryData.rockfallDeltaPeak ?? '--'}`);

  // 2. Broadcast raw & destructured telemetry to active WebSocket subscribers
  broadcastTelemetry(telemetryData);

  // 3. Evaluate alerts if needed
  try {
    const defaultDevice = { id: deviceId, deviceId, name: `Inclinometer ${deviceId}` };
    evaluateTelemetryAlerts(defaultDevice, telemetryData).catch(() => {});
  } catch (e) {}

  return { deviceId, timestamp: utcTimestamp, data: telemetryData };
}
