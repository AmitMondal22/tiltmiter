import { saveTelemetryPoint } from '../../config/influx.js';
import { broadcastTelemetry } from '../../websocket/websocket.service.js';
import { evaluateTelemetryAlerts } from '../../services/alertEngineService.js';
import { Device } from '../../models/index.js';

export async function processAndSaveTelemetry(rawPayload, params = {}) {
  const deviceId = rawPayload.deviceId || rawPayload.device_id || params.deviceId || 'TM-001';

  // 1. Parse tilt angles safely, with fallback from 3-axis accelerometer if tilt object is not present
  let roll = rawPayload.tilt?.roll ?? rawPayload.xTilt ?? rawPayload.roll;
  let pitch = rawPayload.tilt?.pitch ?? rawPayload.yTilt ?? rawPayload.pitch;

  const ax = typeof rawPayload.acceleration?.ax === 'number' ? rawPayload.acceleration.ax : parseFloat(rawPayload.acceleration?.ax);
  const ay = typeof rawPayload.acceleration?.ay === 'number' ? rawPayload.acceleration.ay : parseFloat(rawPayload.acceleration?.ay);
  const az = typeof rawPayload.acceleration?.az === 'number' ? rawPayload.acceleration.az : parseFloat(rawPayload.acceleration?.az);

  if ((roll === undefined || roll === null) && !isNaN(ax) && !isNaN(ay)) {
    const azVal = !isNaN(az) ? az : 9.80665;
    const mag = Math.sqrt(ax * ax + ay * ay + azVal * azVal) || 9.80665;
    roll = (Math.asin(Math.max(-1, Math.min(1, ax / mag))) * 180) / Math.PI;
    pitch = (Math.asin(Math.max(-1, Math.min(1, ay / mag))) * 180) / Math.PI;
  }

  roll = parseFloat(roll) || 0;
  pitch = parseFloat(pitch) || 0;
  const rawTilt = rawPayload.tilt?.tilt ?? rawPayload.resultantTilt ?? rawPayload.tilt;
  const tiltVal = typeof rawTilt === 'number' && !isNaN(rawTilt)
    ? rawTilt
    : Math.sqrt(roll * roll + pitch * pitch);

  const zTilt = typeof rawPayload.tilt?.zTilt === 'number'
    ? rawPayload.tilt.zTilt
    : (!isNaN(az) && !isNaN(ax) && !isNaN(ay) && Math.sqrt(ax * ax + ay * ay + az * az) > 0
      ? (Math.acos(Math.max(-1, Math.min(1, Math.abs(az) / Math.sqrt(ax * ax + ay * ay + az * az)))) * 180) / Math.PI
      : tiltVal);

  // 2. Calculate Slopes in mm/m (1000 * sin(angle))
  const xSlope = Math.sin((roll * Math.PI) / 180) * 1000;
  const ySlope = Math.sin((pitch * Math.PI) / 180) * 1000;
  const zSlope = Math.sin((zTilt * Math.PI) / 180) * 1000;
  const resultantSlope = Math.sin((tiltVal * Math.PI) / 180) * 1000;

  // 3. ClinoX Conversion: Tilt Change to Lateral Displacement (D = L * tan(Δθ * π / 180))
  const L = parseFloat(rawPayload.gaugeLength_mm || rawPayload.L || 1000.0);
  const refX = parseFloat(rawPayload.refThetaX ?? rawPayload.baselineRoll ?? 0.0);
  const refY = parseFloat(rawPayload.refThetaY ?? rawPayload.baselinePitch ?? 0.0);
  const deltaThetaX = roll - refX;
  const deltaThetaY = pitch - refY;

  // Calculate estimated lateral displacement using ClinoX formula
  let xDisp = rawPayload.displacement?.xDisplacement_mm !== undefined
    ? parseFloat(rawPayload.displacement.xDisplacement_mm)
    : (rawPayload.xDisplacement !== undefined ? parseFloat(rawPayload.xDisplacement) : L * Math.tan((deltaThetaX * Math.PI) / 180));
  let yDisp = rawPayload.displacement?.yDisplacement_mm !== undefined
    ? parseFloat(rawPayload.displacement.yDisplacement_mm)
    : (rawPayload.yDisplacement !== undefined ? parseFloat(rawPayload.yDisplacement) : L * Math.tan((deltaThetaY * Math.PI) / 180));
  const zDisp = parseFloat(rawPayload.displacement?.zDisplacement_mm ?? rawPayload.zDisplacement ?? 0) || 0;

  if (isNaN(xDisp)) xDisp = L * Math.tan((deltaThetaX * Math.PI) / 180);
  if (isNaN(yDisp)) yDisp = L * Math.tan((deltaThetaY * Math.PI) / 180);

  const rawTotalDisp = rawPayload.displacement?.totalDisplacement_mm ?? rawPayload.totalDisplacement;
  const totalDisp = typeof rawTotalDisp === 'number' && !isNaN(rawTotalDisp)
    ? rawTotalDisp
    : Math.sqrt(xDisp * xDisp + yDisp * yDisp + zDisp * zDisp);

  // 4. Parse environment, battery voltage & cellular CSQ
  const temp = parseFloat(rawPayload.environment?.temperature ?? rawPayload.temperature ?? rawPayload.tempVal ?? 25.0) || 25.0;
  const batteryVoltage = parseFloat(rawPayload.power?.batteryVoltage ?? rawPayload.batteryVoltage ?? 13.03) || 13.03;
  const csq = parseInt(rawPayload.network?.csq ?? rawPayload.csq ?? 19, 10) || 19;

  let utcTimestamp;
  if (rawPayload.timestamp) {
    const parsed = new Date(rawPayload.timestamp);
    utcTimestamp = !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  } else {
    utcTimestamp = new Date().toISOString();
  }

  const telemetryData = {
    // Preserve raw nested payload
    rawPayload,
    deviceId,

    // Mapped flat fields for UI component binding
    xTilt: roll,
    yTilt: pitch,
    zTilt,
    resultantTilt: tiltVal,
    roll,
    pitch,
    tilt: tiltVal,
    tiltStatus: rawPayload.tilt?.tiltStatus || 'NORMAL',

    // Calculated slopes in mm/m
    xSlope,
    ySlope,
    zSlope,
    resultantSlope,

    acceleration: rawPayload.acceleration || {},
    accMag: rawPayload.acceleration?.accMag || (!isNaN(ax) && !isNaN(ay) ? Math.sqrt(ax * ax + ay * ay + (az || 9.8) * (az || 9.8)) : 9.82),

    gyroscope: rawPayload.gyroscope || {},
    gyroMag: rawPayload.gyroscope?.gyroMag || 0.008,

    vibration: rawPayload.vibration || {},
    displacement: rawPayload.displacement || {},

    xDisplacement: xDisp,
    yDisplacement: yDisp,
    zDisplacement: zDisp,
    totalDisplacement: totalDisp,

    environment: rawPayload.environment || {},
    temperature: `${temp} °C`,
    tempVal: temp,

    power: rawPayload.power || { batteryVoltage },
    batteryVoltage,

    network: rawPayload.network || { csq },
    csq,

    calibration: rawPayload.calibration || { calibrated: false },
    timestamp: utcTimestamp,
  };

  // 1. Save to Time-Series InfluxDB & PostgreSQL
  saveTelemetryPoint(telemetryData);

  // 2. Broadcast raw & mapped telemetry to WebSockets
  broadcastTelemetry(telemetryData);

  // 3. Asynchronously evaluate alerts against safety thresholds
  Device.findByPk(deviceId).then(device => {
    if (device) {
      evaluateTelemetryAlerts(device, telemetryData).catch(err => {
        console.warn(`[Alert Engine] Evaluation error on ${deviceId}:`, err.message);
      });
    }
  }).catch(() => {});

  return { deviceId, timestamp: telemetryData.timestamp, data: telemetryData };
}
