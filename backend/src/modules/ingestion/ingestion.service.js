import { saveTelemetryPoint } from '../../config/influx.js';
import { broadcastTelemetry } from '../../websocket/websocket.service.js';
import { evaluateTelemetryAlerts } from '../../services/alertEngineService.js';
import { Device } from '../../models/Device.js';
import pkg from 'sequelize';
const { Op } = pkg;

export async function processAndSaveTelemetry(rawPayload, params = {}) {
  const deviceId = rawPayload.deviceId || rawPayload.device_id || params.deviceId || 'TM-001';

  // 1. Parse tilt angles safely:
  // roll = X axis
  // pitch = Y axis
  // yaw = Z axis (optional, default 0.0)
  // tilt = Resultant tilt
  let roll = rawPayload.tilt?.roll ?? rawPayload.xTilt ?? rawPayload.roll;
  let pitch = rawPayload.tilt?.pitch ?? rawPayload.yTilt ?? rawPayload.pitch;
  const rawYaw = rawPayload.tilt?.yaw ?? rawPayload.yaw ?? rawPayload.tilt?.zTilt ?? rawPayload.zTilt;
  let yaw = (rawYaw !== undefined && rawYaw !== null && !isNaN(parseFloat(rawYaw))) ? parseFloat(rawYaw) : 0.0;

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
  yaw = parseFloat(yaw) || 0;

  const rawTilt = rawPayload.tilt?.tilt ?? rawPayload.resultantTilt ?? rawPayload.tilt;
  const tiltVal = typeof rawTilt === 'number' && !isNaN(rawTilt)
    ? rawTilt
    : Math.sqrt(roll * roll + pitch * pitch);

  // yaw is the Z-value
  const zTilt = yaw;

  // 3. ClinoX Conversion & Database Reference Zero Lookup
  let deviceRecord = null;
  try {
    if (Device && typeof Device.findByPk === 'function') {
      deviceRecord = await Device.findByPk(deviceId);
      if (!deviceRecord && Op) {
        deviceRecord = await Device.findOne({
          where: {
            [Op.or]: [
              { id: deviceId },
              { id: String(deviceId).toUpperCase() },
              { id: String(deviceId).toLowerCase() }
            ]
          }
        });
      }
    }
  } catch (e) {}

  const isHardwareCalibrated = Boolean(rawPayload.calibration?.calibrated);
  const hasRefZero = Boolean(deviceRecord?.calibrate ?? deviceRecord?.hasReferenceZero ?? false);
  const dbRefX = deviceRecord?.refThetaX !== undefined && deviceRecord?.refThetaX !== null ? parseFloat(deviceRecord.refThetaX) : 0.0;
  const dbRefY = deviceRecord?.refThetaY !== undefined && deviceRecord?.refThetaY !== null ? parseFloat(deviceRecord.refThetaY) : 0.0;
  const dbRefZ = deviceRecord?.refThetaZ !== undefined && deviceRecord?.refThetaZ !== null ? parseFloat(deviceRecord.refThetaZ) : 0.0;
  const dbGaugeL = deviceRecord?.gaugeLength_mm ? parseFloat(deviceRecord.gaugeLength_mm) : 1000.0;

  const L = parseFloat(rawPayload.gaugeLength_mm || rawPayload.L || dbGaugeL);
  // When hardware already reports calibrated: true, it sends delta angles directly relative to tare baseline
  const refX = isHardwareCalibrated ? 0.0 : parseFloat(rawPayload.refThetaX ?? rawPayload.baselineRoll ?? (hasRefZero ? dbRefX : 0.0));
  const refY = isHardwareCalibrated ? 0.0 : parseFloat(rawPayload.refThetaY ?? rawPayload.baselinePitch ?? (hasRefZero ? dbRefY : 0.0));
  const refZ = isHardwareCalibrated ? 0.0 : parseFloat(rawPayload.refThetaZ ?? (hasRefZero ? dbRefZ : 0.0));
  const deltaThetaX = isHardwareCalibrated ? roll : (roll - refX);
  const deltaThetaY = isHardwareCalibrated ? pitch : (pitch - refY);
  const deltaThetaZ = isHardwareCalibrated ? yaw : (yaw - refZ);

  // If device is tare zero calibrated or hardware calibrated, report tilt relative to zero reference baseline
  let activeXTilt = (hasRefZero || isHardwareCalibrated) ? deltaThetaX : roll;
  let activeYTilt = (hasRefZero || isHardwareCalibrated) ? deltaThetaY : pitch;
  let activeZTilt = (hasRefZero || isHardwareCalibrated) ? deltaThetaZ : yaw;
  let activeResultant = (hasRefZero || isHardwareCalibrated) ? Math.sqrt(deltaThetaX * deltaThetaX + deltaThetaY * deltaThetaY) : tiltVal;

  // Clean zero rounding for noise near zero
  if ((isHardwareCalibrated || hasRefZero) && Math.abs(activeXTilt) < 0.0001 && Math.abs(activeYTilt) < 0.0001 && Math.abs(activeZTilt) < 0.0001) {
    activeXTilt = 0.0;
    activeYTilt = 0.0;
    activeZTilt = 0.0;
    activeResultant = 0.0;
  }

  // Calculate Slopes in mm/m (1000 * sin(angle)) based on the active reported delta angles
  const xSlope = Math.sin((activeXTilt * Math.PI) / 180) * 1000;
  const ySlope = Math.sin((activeYTilt * Math.PI) / 180) * 1000;
  const zSlope = Math.sin((activeZTilt * Math.PI) / 180) * 1000;
  const resultantSlope = Math.sin((activeResultant * Math.PI) / 180) * 1000;

  // Calculate estimated lateral displacement using ClinoX formula
  let xDisp = (activeXTilt === 0.0 && (isHardwareCalibrated || hasRefZero)) ? 0.0 : (rawPayload.displacement?.xDisplacement_mm !== undefined
    ? parseFloat(rawPayload.displacement.xDisplacement_mm)
    : (rawPayload.xDisplacement !== undefined ? parseFloat(rawPayload.xDisplacement) : L * Math.tan((deltaThetaX * Math.PI) / 180)));
  let yDisp = (activeYTilt === 0.0 && (isHardwareCalibrated || hasRefZero)) ? 0.0 : (rawPayload.displacement?.yDisplacement_mm !== undefined
    ? parseFloat(rawPayload.displacement.yDisplacement_mm)
    : (rawPayload.yDisplacement !== undefined ? parseFloat(rawPayload.yDisplacement) : L * Math.tan((deltaThetaY * Math.PI) / 180)));
  const zDisp = (activeXTilt === 0.0 && activeYTilt === 0.0 && (isHardwareCalibrated || hasRefZero)) ? 0.0 : (parseFloat(rawPayload.displacement?.zDisplacement_mm ?? rawPayload.zDisplacement ?? 0) || 0);

  if (isNaN(xDisp)) xDisp = L * Math.tan((deltaThetaX * Math.PI) / 180);
  if (isNaN(yDisp)) yDisp = L * Math.tan((deltaThetaY * Math.PI) / 180);

  const rawTotalDisp = rawPayload.displacement?.totalDisplacement_mm ?? rawPayload.totalDisplacement;
  const totalDisp = (activeXTilt === 0.0 && activeYTilt === 0.0 && (isHardwareCalibrated || hasRefZero)) ? 0.0 : (typeof rawTotalDisp === 'number' && !isNaN(rawTotalDisp)
    ? rawTotalDisp
    : Math.sqrt(xDisp * xDisp + yDisp * yDisp + zDisp * zDisp));

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

  // Ensure rawPayload.tilt has standard format with roll, pitch, yaw, tilt, tiltStatus
  if (!rawPayload.tilt || typeof rawPayload.tilt !== 'object') {
    rawPayload.tilt = {};
  }
  rawPayload.tilt = {
    roll,
    pitch,
    yaw,
    tilt: rawPayload.tilt.tilt ?? activeResultant,
    tiltStatus: rawPayload.tilt.tiltStatus || 'NORMAL',
  };

  const telemetryData = {
    // Preserve raw nested payload
    rawPayload,
    deviceId,

    // Mapped flat fields for UI component binding
    xTilt: activeXTilt,
    yTilt: activeYTilt,
    zTilt: activeZTilt,
    resultantTilt: activeResultant,
    roll: activeXTilt,
    pitch: activeYTilt,
    yaw: activeZTilt,
    rawRoll: roll,
    rawPitch: pitch,
    rawYaw: yaw,
    tilt: activeResultant,
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

  // 1. Save to Time-Series PostgreSQL
  saveTelemetryPoint(telemetryData);
  console.log(`💾 [POSTGRESQL SAVED] Device: ${deviceId} | Time: ${utcTimestamp} | θX: ${activeXTilt.toFixed(3)}° | θY: ${activeYTilt.toFixed(3)}° | TotDisp: ${totalDisp.toFixed(3)}mm`);

  // 2. Broadcast raw & mapped telemetry to WebSockets
  broadcastTelemetry(telemetryData);
  console.log(`📡 [WEBSOCKET BROADCAST SENT] Live packet broadcasted to connected web clients for device ${deviceId}`);

  // 3. Asynchronously evaluate alerts against safety thresholds for this device
  const defaultDevice = { id: deviceId, deviceId, name: `Inclinometer ${deviceId}` };
  if (Device && typeof Device.findByPk === 'function') {
    Device.findByPk(deviceId)
      .then(device => {
        const devObj = device ? (device.toJSON ? device.toJSON() : device) : defaultDevice;
        evaluateTelemetryAlerts(devObj, telemetryData).catch(err => {
          console.warn(`[Alert Engine] Evaluation error on ${deviceId}:`, err.message);
        });
      })
      .catch(() => {
        evaluateTelemetryAlerts(defaultDevice, telemetryData).catch(err => {
          console.warn(`[Alert Engine] Evaluation error on ${deviceId}:`, err.message);
        });
      });
  } else {
    evaluateTelemetryAlerts(defaultDevice, telemetryData).catch(err => {
      console.warn(`[Alert Engine] Evaluation error on ${deviceId}:`, err.message);
    });
  }

  return { deviceId, timestamp: telemetryData.timestamp, data: telemetryData };
}
