import { saveTelemetryPoint } from '../../config/influx.js';
import { broadcastTelemetry } from '../../websocket/websocket.service.js';

export async function processAndSaveTelemetry(rawPayload, params = {}) {
  const deviceId = rawPayload.deviceId || params.deviceId || 'TM-001';

  // Parse numeric values safely from raw nested JSON payload
  const roll = rawPayload.tilt?.roll ?? rawPayload.xTilt ?? 0;
  const pitch = rawPayload.tilt?.pitch ?? rawPayload.yTilt ?? 0;
  const tiltVal = rawPayload.tilt?.tilt ?? rawPayload.resultantTilt ?? Math.sqrt(roll * roll + pitch * pitch);

  const xDisp = rawPayload.displacement?.xDisplacement_mm ?? rawPayload.xDisplacement ?? 0;
  const yDisp = rawPayload.displacement?.yDisplacement_mm ?? rawPayload.yDisplacement ?? 0;
  const zDisp = rawPayload.displacement?.zDisplacement_mm ?? 0;
  const totalDisp = rawPayload.displacement?.totalDisplacement_mm ?? rawPayload.totalDisplacement ?? Math.sqrt(xDisp * xDisp + yDisp * yDisp);

  const temp = rawPayload.environment?.temperature ?? rawPayload.tempVal ?? 29.69;

  const telemetryData = {
    // Preserve raw nested payload
    rawPayload,
    deviceId,

    // Mapped flat fields for UI component binding
    xTilt: roll,
    yTilt: pitch,
    resultantTilt: tiltVal,
    roll,
    pitch,
    tilt: tiltVal,
    tiltStatus: rawPayload.tilt?.tiltStatus || 'NORMAL',

    acceleration: rawPayload.acceleration || {},
    accMag: rawPayload.acceleration?.accMag || 9.82,

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

    calibration: rawPayload.calibration || { calibrated: true },
    timestamp: rawPayload.timestamp || new Date().toISOString(),
  };

  // 1. Save to Time-Series InfluxDB & In-memory ring buffer
  saveTelemetryPoint(telemetryData);

  // 2. Broadcast raw & mapped telemetry to WebSockets
  broadcastTelemetry(telemetryData);

  return { deviceId, timestamp: telemetryData.timestamp, data: telemetryData };
}
