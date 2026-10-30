import { saveTelemetryPoint } from '../../services/telemetryStore.js';
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

  // 1. Reference Angles: Use stored device reference baseline if configured, else payload reference, else 0.0°
  let refX = 0.0;
  let refY = 0.0;
  let refZ = 0.0;
  const isCalibrated = Boolean(deviceRecord?.hasReferenceZero || deviceRecord?.calibrate);

  if (isCalibrated) {
    if (deviceRecord?.refThetaX !== undefined && deviceRecord?.refThetaX !== null && !isNaN(parseFloat(deviceRecord.refThetaX))) {
      refX = parseFloat(deviceRecord.refThetaX);
    }
    if (deviceRecord?.refThetaY !== undefined && deviceRecord?.refThetaY !== null && !isNaN(parseFloat(deviceRecord.refThetaY))) {
      refY = parseFloat(deviceRecord.refThetaY);
    }
    if (deviceRecord?.refThetaZ !== undefined && deviceRecord?.refThetaZ !== null && !isNaN(parseFloat(deviceRecord.refThetaZ))) {
      refZ = parseFloat(deviceRecord.refThetaZ);
    }
  } else if (rawPayload.refThetaX !== undefined && !isNaN(parseFloat(rawPayload.refThetaX))) {
    refX = parseFloat(rawPayload.refThetaX);
    if (rawPayload.refThetaY !== undefined && !isNaN(parseFloat(rawPayload.refThetaY))) {
      refY = parseFloat(rawPayload.refThetaY);
    }
    if (rawPayload.refThetaZ !== undefined && !isNaN(parseFloat(rawPayload.refThetaZ))) {
      refZ = parseFloat(rawPayload.refThetaZ);
    }
  }

  const hasRefZero = Boolean(isCalibrated || (refX !== 0 || refY !== 0 || refZ !== 0));
  const dbGaugeL = deviceRecord?.gaugeLength_mm ? parseFloat(deviceRecord.gaugeLength_mm) : 1000.0;
  const L = parseFloat(rawPayload.gaugeLength_mm || rawPayload.L || dbGaugeL);

  // 2. Direct device angles without logic modification
  const deltaThetaX = roll;
  const deltaThetaY = pitch;
  const deltaThetaZ = yaw;

  // Present Values = Pure actual device values (NEVER subtracted by reference zero)
  const presentX = roll;
  const presentY = pitch;
  const presentZ = yaw;
  const presentResultant = tiltVal;

  // Slopes in mm/m (1000 * sin(angle))
  const xSlope = Math.sin((deltaThetaX * Math.PI) / 180) * 1000;
  const ySlope = Math.sin((deltaThetaY * Math.PI) / 180) * 1000;
  const zSlope = Math.sin((deltaThetaZ * Math.PI) / 180) * 1000;
  const resultantSlope = Math.sin((Math.sqrt(deltaThetaX * deltaThetaX + deltaThetaY * deltaThetaY) * Math.PI) / 180) * 1000;

  // 3. Device-provided displacement data:
  const rawDisp = rawPayload.displacement || {};
  const hasDevXDisp = rawDisp.xDisplacement_mm !== undefined && rawDisp.xDisplacement_mm !== null && !isNaN(parseFloat(rawDisp.xDisplacement_mm));
  const hasDevYDisp = rawDisp.yDisplacement_mm !== undefined && rawDisp.yDisplacement_mm !== null && !isNaN(parseFloat(rawDisp.yDisplacement_mm));
  const hasDevZDisp = rawDisp.zDisplacement_mm !== undefined && rawDisp.zDisplacement_mm !== null && !isNaN(parseFloat(rawDisp.zDisplacement_mm));
  const hasDevTotDisp = rawDisp.totalDisplacement_mm !== undefined && rawDisp.totalDisplacement_mm !== null && !isNaN(parseFloat(rawDisp.totalDisplacement_mm));

  let xDisp = hasDevXDisp ? parseFloat(rawDisp.xDisplacement_mm) : (L * Math.tan((deltaThetaX * Math.PI) / 180));
  let yDisp = hasDevYDisp ? parseFloat(rawDisp.yDisplacement_mm) : (L * Math.tan((deltaThetaY * Math.PI) / 180));
  let zDisp = hasDevZDisp ? parseFloat(rawDisp.zDisplacement_mm) : (parseFloat(rawPayload.zDisplacement ?? 0) || 0.0);

  if (isNaN(xDisp)) xDisp = 0.0;
  if (isNaN(yDisp)) yDisp = 0.0;
  if (isNaN(zDisp)) zDisp = 0.0;

  let totalDisp = hasDevTotDisp ? parseFloat(rawDisp.totalDisplacement_mm) : Math.sqrt(xDisp * xDisp + yDisp * yDisp + zDisp * zDisp);
  if (isNaN(totalDisp)) totalDisp = 0.0;

  // 4. Parse environment, battery voltage & cellular CSQ safely without replacing 0.0 with fallbacks
  const rawEnvTemp = rawPayload.environment?.temperature ?? rawPayload.temperature ?? rawPayload.tempVal;
  const temp = (rawEnvTemp !== undefined && rawEnvTemp !== null && !isNaN(parseFloat(rawEnvTemp)))
    ? parseFloat(rawEnvTemp)
    : 0.0;

  const rawPowerBat = rawPayload.power?.batteryVoltage ?? rawPayload.batteryVoltage;
  const batteryVoltage = (rawPowerBat !== undefined && rawPowerBat !== null && !isNaN(parseFloat(rawPowerBat)))
    ? parseFloat(rawPowerBat)
    : 0.0;

  const rawNetCsq = rawPayload.network?.csq ?? rawPayload.csq;
  const csq = (rawNetCsq !== undefined && rawNetCsq !== null && !isNaN(parseInt(rawNetCsq, 10)))
    ? parseInt(rawNetCsq, 10)
    : 0;

  let utcTimestamp;
  if (rawPayload.timestamp) {
    const parsed = new Date(rawPayload.timestamp);
    utcTimestamp = !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  } else {
    utcTimestamp = new Date().toISOString();
  }

  // Ensure rawPayload.tilt has standard format with pure device roll, pitch, yaw
  if (!rawPayload.tilt || typeof rawPayload.tilt !== 'object') {
    rawPayload.tilt = {};
  }
  rawPayload.tilt = {
    roll,
    pitch,
    yaw,
    tilt: rawPayload.tilt.tilt ?? tiltVal,
    tiltStatus: rawPayload.tilt.tiltStatus || 'NORMAL',
  };

  const telemetryData = {
    // Preserve raw nested payload intact
    rawPayload,
    deviceId,

    // Pure actual device values stored into PostgreSQL without any subtraction
    xTilt: presentX,
    yTilt: presentY,
    zTilt: presentZ,
    resultantTilt: presentResultant,
    roll: presentX,
    pitch: presentY,
    yaw: presentZ,
    rawRoll: roll,
    rawPitch: pitch,
    rawYaw: yaw,

    // Core Logic fields for UI and WebSocket subscribers
    presentX,
    presentY,
    presentZ,
    presentRoll: presentX,
    presentPitch: presentY,
    presentYaw: presentZ,

    // Delta angles (Current − Zero Reference) in full precision
    deltaX: deltaThetaX,
    deltaY: deltaThetaY,
    deltaZ: deltaThetaZ,
    deltaThetaX,
    deltaThetaY,
    deltaThetaZ,

    refThetaX: refX,
    refThetaY: refY,
    refThetaZ: refZ,
    hasReferenceZero: hasRefZero,

    tilt: presentResultant,
    tiltStatus: rawPayload.tilt?.tiltStatus || 'NORMAL',

    // Calculated slopes in mm/m
    xSlope,
    ySlope,
    zSlope,
    resultantSlope,

    acceleration: rawPayload.acceleration || {},
    accMag: (rawPayload.acceleration?.accMag !== undefined && rawPayload.acceleration?.accMag !== null && !isNaN(parseFloat(rawPayload.acceleration.accMag)))
      ? parseFloat(rawPayload.acceleration.accMag)
      : (!isNaN(ax) && !isNaN(ay) ? Math.sqrt(ax * ax + ay * ay + (!isNaN(az) ? az * az : 0)) : 0.0),

    gyroscope: rawPayload.gyroscope || {},
    gyroMag: (rawPayload.gyroscope?.gyroMag !== undefined && rawPayload.gyroscope?.gyroMag !== null && !isNaN(parseFloat(rawPayload.gyroscope.gyroMag)))
      ? parseFloat(rawPayload.gyroscope.gyroMag)
      : 0.0,

    vibration: rawPayload.vibration || {},
    displacement: {
      xDisplacement_mm: xDisp,
      yDisplacement_mm: yDisp,
      zDisplacement_mm: zDisp,
      totalDisplacement_mm: totalDisp,
      ...(rawPayload.displacement || {}),
    },

    xDisplacement: xDisp,
    yDisplacement: yDisp,
    zDisplacement: zDisp,
    totalDisplacement: totalDisp,
    xDisplacement_mm: xDisp,
    yDisplacement_mm: yDisp,
    zDisplacement_mm: zDisp,
    totalDisplacement_mm: totalDisp,

    environment: rawPayload.environment || {},
    temperature: `${temp} °C`,
    tempVal: temp,

    power: rawPayload.power || { batteryVoltage },
    batteryVoltage,

    network: rawPayload.network || { csq },
    csq,

    calibration: rawPayload.calibration || { calibrated: hasRefZero },
    timestamp: utcTimestamp,
  };

  // 1. Save to Time-Series PostgreSQL - values stored purely without zero reference subtraction
  await saveTelemetryPoint(telemetryData);
  console.log(`💾 [POSTGRESQL SAVED] Device: ${deviceId} | Time: ${utcTimestamp} | θX: ${presentX.toFixed(3)}° | θY: ${presentY.toFixed(3)}° | TotDisp: ${totalDisp.toFixed(3)}mm`);

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
