import { Device, TelemetryRecord } from '../models/index.js';

// In-memory ring buffer cache for live telemetry
export const inMemoryTelemetryStore = new Map();

/**
 * Saves incoming telemetry directly and cleanly into PostgreSQL.
 * Strictly uses the device's exact payload without inserting random/synthetic data.
 * Destructures all fields and stores the rawPayload completely unaltered.
 */
export async function saveTelemetryPoint(data) {
  if (!data || (!data.deviceId && !data.device_id)) return null;

  const rawPayload = data.rawPayload || data;
  const deviceId = data.deviceId || data.device_id || rawPayload.device_id || rawPayload.deviceId || null;
  if (!deviceId) return null;
  const schemaVersion = parseInt(rawPayload.schemaVersion ?? data.schemaVersion ?? 2, 10);
  const sampleUptimeMs = rawPayload.sampleUptimeMs !== undefined ? parseInt(rawPayload.sampleUptimeMs, 10) : null;

  const parseNum = (v) => {
    if (v === null || v === undefined || v === '' || v === '--') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return !isNaN(n) ? n : null;
  };

  // Destructure Angles (prefer schema v2 angleDelta / tilt / angleCurrent)
  const angleDelta = rawPayload.angleDelta || {};
  const tilt = rawPayload.tilt || {};
  const angleCurrent = rawPayload.angleCurrent || {};
  const angleReference = rawPayload.angleReference || {};

  const xTilt = parseNum(angleDelta.x ?? tilt.roll ?? data.xTilt ?? data.roll);
  const yTilt = parseNum(angleDelta.y ?? tilt.pitch ?? data.yTilt ?? data.pitch);
  const zTilt = parseNum(angleDelta.z ?? tilt.yaw ?? data.zTilt ?? data.yaw);
  const yaw = zTilt;
  const resultantTilt = parseNum(tilt.tilt ?? data.resultantTilt ?? data.tilt) ?? (xTilt !== null && yTilt !== null ? Math.sqrt(xTilt * xTilt + yTilt * yTilt) : null);

  // Destructure Displacement (all 3 axes)
  const rawDisp = rawPayload.displacement || data.displacement || {};
  const xDisplacement = parseNum(rawDisp.xDisplacement_mm ?? data.xDisplacement ?? data.xDisp);
  const yDisplacement = parseNum(rawDisp.yDisplacement_mm ?? data.yDisplacement ?? data.yDisp);
  const zDisplacement = parseNum(rawDisp.zDisplacement_mm ?? data.zDisplacement ?? data.zDisp);
  const totalDisplacement = parseNum(rawDisp.totalDisplacement_mm ?? data.totalDisplacement ?? data.totalDisp) ?? (xDisplacement !== null && yDisplacement !== null ? Math.sqrt(xDisplacement * xDisplacement + yDisplacement * yDisplacement + (zDisplacement || 0) * (zDisplacement || 0)) : null);

  // Destructure Temperature, Battery, CSQ
  const rawEnvTemp = rawPayload.environment?.temperature ?? data.environment?.temperature ?? data.tempVal ?? data.temperature;
  const tempVal = (rawEnvTemp !== undefined && rawEnvTemp !== null && !isNaN(parseFloat(rawEnvTemp)))
    ? parseFloat(rawEnvTemp)
    : null;

  const rawPowerBat = rawPayload.power?.batteryVoltage ?? data.power?.batteryVoltage ?? data.batteryVoltage ?? data.battery;
  const batteryVoltage = (rawPowerBat !== undefined && rawPowerBat !== null && !isNaN(parseFloat(rawPowerBat)))
    ? parseFloat(rawPowerBat)
    : null;

  const rawNetCsq = rawPayload.network?.csq ?? data.network?.csq ?? data.csq ?? data.signalStrength;
  const csq = (rawNetCsq !== undefined && rawNetCsq !== null && !isNaN(parseInt(rawNetCsq, 10)))
    ? parseInt(rawNetCsq, 10)
    : null;

  // Destructure Acceleration, Gyroscope, Vibration, Hazard & Motion
  const acceleration = rawPayload.acceleration || data.acceleration || null;
  const accelerationCurrent = rawPayload.accelerationCurrent || data.accelerationCurrent || null;
  const accelerationReference = rawPayload.accelerationReference || data.accelerationReference || null;
  const accelerationDelta = rawPayload.accelerationDelta || data.accelerationDelta || null;
  const gyroscope = rawPayload.gyroscope || data.gyroscope || null;
  const vibration = rawPayload.vibration || data.vibration || null;
  const environment = rawPayload.environment || data.environment || null;
  const power = rawPayload.power || data.power || null;
  const network = rawPayload.network || data.network || null;
  const calibration = rawPayload.calibration || data.calibration || null;
  const rockfallAlarm = rawPayload.rockfallAlarm || data.rockfallAlarm || null;
  const motionEvent = rawPayload.motionEvent || data.motionEvent || null;
  const monitoringSettings = rawPayload.monitoringSettings || data.monitoringSettings || null;
  const units = rawPayload.units || data.units || null;

  const rockfallDeltaPeak = typeof accelerationDelta?.peak === 'number' ? accelerationDelta.peak : null;
  const touchVibrationPeak = typeof vibration?.vibrationPeak === 'number' ? vibration.vibrationPeak : null;
  const vibrationRMS = typeof vibration?.vibrationRMS === 'number' ? vibration.vibrationRMS : null;
  const motionClassification = motionEvent?.classification || null;
  const alarmActive = Boolean(rockfallAlarm?.active);
  const eventPending = Boolean(motionEvent?.pending);

  const validTimestamp = data.timestamp ? new Date(data.timestamp) : new Date();
  const safeTimestamp = !isNaN(validTimestamp.getTime()) ? validTimestamp : new Date();
  const isoTimestamp = safeTimestamp.toISOString();

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
        motionClassification: motionClassification || 'STABLE',
        alarmActive,
        rockfallDeltaPeak,
        vibrationPeak: touchVibrationPeak,
        monitoringSettings,
      },
    });

    await deviceInstance.update({
      xTilt,
      yTilt,
      zTilt,
      yaw,
      resultantTilt,
      xDisplacement,
      yDisplacement,
      totalDisplacement,
      temperature: tempVal,
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
      tilt,
      angleReference,
      angleCurrent,
      angleDelta,
      vibration,
      displacement: rawDisp,
      environment,
      power,
      network,
      calibration,
      rockfallAlarm,
      motionEvent,
      monitoringSettings,
      units,
      rawPayload,
    };

    const [record, created] = await TelemetryRecord.findOrCreate({
      where: {
        deviceId,
        timestamp: safeTimestamp,
      },
      defaults: recordPayload,
    });

    if (!created) {
      await record.update(recordPayload);
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
    tilt,
    angleReference,
    angleCurrent,
    angleDelta,
    vibration,
    displacement: rawDisp,
    environment,
    power,
    network,
    calibration,
    rockfallAlarm,
    motionEvent,
    monitoringSettings,
    units,
    rawPayload,
    ...data,
  };

  deviceHistory.push(cachedPoint);
  if (deviceHistory.length > 500) {
    deviceHistory.shift();
  }

  return true;
}
