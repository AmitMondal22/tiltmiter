import { Device, TelemetryRecord } from '../models/index.js';

// In-memory ring buffer cache for live telemetry
export const inMemoryTelemetryStore = new Map();

/**
 * Saves incoming telemetry directly and cleanly into PostgreSQL.
 * Strictly uses the device's exact payload without inserting random/synthetic data.
 */
export async function saveTelemetryPoint(data) {
  if (!data || !data.deviceId) return null;

  const deviceId = data.deviceId;
  const xTilt = typeof data.xTilt === 'number' ? data.xTilt : (parseFloat(data.tilt?.roll ?? data.roll) || 0.0);
  const yTilt = typeof data.yTilt === 'number' ? data.yTilt : (parseFloat(data.tilt?.pitch ?? data.pitch) || 0.0);
  const zTilt = typeof data.zTilt === 'number' ? data.zTilt : (parseFloat(data.tilt?.yaw ?? data.yaw) || 0.0);
  const yaw = zTilt;
  const resultantTilt = typeof data.resultantTilt === 'number' ? data.resultantTilt : (parseFloat(data.tilt?.tilt ?? data.tilt) || Math.sqrt(xTilt * xTilt + yTilt * yTilt));

  const rawDisp = data.displacement || data.rawPayload?.displacement || {};
  const xDisplacement = typeof data.xDisplacement === 'number' ? data.xDisplacement : (parseFloat(rawDisp.xDisplacement_mm ?? data.xDisplacement_mm) || 0.0);
  const yDisplacement = typeof data.yDisplacement === 'number' ? data.yDisplacement : (parseFloat(rawDisp.yDisplacement_mm ?? data.yDisplacement_mm) || 0.0);
  const zDisplacement = typeof data.zDisplacement === 'number' ? data.zDisplacement : (parseFloat(rawDisp.zDisplacement_mm ?? data.zDisplacement_mm) || 0.0);
  const totalDisplacement = typeof data.totalDisplacement === 'number'
    ? data.totalDisplacement
    : (parseFloat(rawDisp.totalDisplacement_mm ?? data.totalDisplacement_mm) || Math.sqrt(xDisplacement * xDisplacement + yDisplacement * yDisplacement + zDisplacement * zDisplacement));

  const rawEnvTemp = data.tempVal ?? data.environment?.temperature ?? data.temperature;
  const tempVal = (rawEnvTemp !== undefined && rawEnvTemp !== null && !isNaN(parseFloat(rawEnvTemp)))
    ? parseFloat(rawEnvTemp)
    : null;

  const rawPowerBat = data.batteryVoltage ?? data.power?.batteryVoltage ?? data.battery;
  const batteryVoltage = (rawPowerBat !== undefined && rawPowerBat !== null && !isNaN(parseFloat(rawPowerBat)))
    ? parseFloat(rawPowerBat)
    : null;

  const rawNetCsq = data.csq ?? data.network?.csq ?? data.signalStrength;
  const csq = (rawNetCsq !== undefined && rawNetCsq !== null && !isNaN(parseInt(rawNetCsq, 10)))
    ? parseInt(rawNetCsq, 10)
    : null;

  const validTimestamp = data.timestamp ? new Date(data.timestamp) : new Date();
  const safeTimestamp = !isNaN(validTimestamp.getTime()) ? validTimestamp : new Date();
  const isoTimestamp = safeTimestamp.toISOString();

  // 1. Ensure Device exists in PostgreSQL devices table first (satisfies foreign key constraint)
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
        battery: batteryVoltage !== null ? `${batteryVoltage} V` : '0 V',
        signalStrength: csq !== null ? `${csq} CSQ` : '0 CSQ',
        status: data.tiltStatus || 'ONLINE',
        lastSeen: safeTimestamp,
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
      battery: batteryVoltage !== null ? `${batteryVoltage} V` : (data.battery || deviceInstance.battery),
      signalStrength: csq !== null ? `${csq} CSQ` : (data.signalStrength || deviceInstance.signalStrength),
      status: data.tiltStatus || data.status || deviceInstance.status || 'ONLINE',
      lastSeen: safeTimestamp,
    });

    // 2. Persist directly into PostgreSQL TelemetryRecord table
    const [record, created] = await TelemetryRecord.findOrCreate({
      where: {
        deviceId,
        timestamp: safeTimestamp,
      },
      defaults: {
        deviceId,
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
        acceleration: data.acceleration || null,
        gyroscope: data.gyroscope || null,
        vibration: data.vibration || null,
        rawPayload: data.rawPayload || data,
      },
    });

    if (!created) {
      // If packet with this exact timestamp exists, update with latest values rather than inserting random new row
      await record.update({
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
        acceleration: data.acceleration || null,
        gyroscope: data.gyroscope || null,
        vibration: data.vibration || null,
        rawPayload: data.rawPayload || data,
      });
    }
  } catch (err) {
    console.warn(`[PostgreSQL Telemetry Warning] Database update for ${deviceId}:`, err.message);
  }

  // 3. Keep in-memory cache ring buffer for active subscribers
  if (!inMemoryTelemetryStore.has(deviceId)) {
    inMemoryTelemetryStore.set(deviceId, []);
  }
  const deviceHistory = inMemoryTelemetryStore.get(deviceId);
  deviceHistory.push({
    time: safeTimestamp.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    timestamp: isoTimestamp,
    deviceId,
    xTilt,
    yTilt,
    zTilt,
    resultantTilt,
    xDisp: xDisplacement,
    yDisp: yDisplacement,
    zDisp: zDisplacement,
    totalDisp: totalDisplacement,
    temperature: tempVal,
    acceleration: data.acceleration || null,
    gyroscope: data.gyroscope || null,
    vibration: data.vibration || null,
    ...data,
  });

  if (deviceHistory.length > 500) {
    deviceHistory.shift();
  }

  return true;
}
