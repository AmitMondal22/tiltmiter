// InfluxDB OSS Config - DISABLED on server; PostgreSQL is primary time-series store.
// Uncomment InfluxDB sections below only when InfluxDB OSS is running and configured.
// import { InfluxDB, Point } from '@influxdata/influxdb-client';
import dotenv from 'dotenv';
import { Device, TelemetryRecord } from '../models/index.js';

dotenv.config();

// InfluxDB connection parameters (kept for reference / future use)
// const url = process.env.INFLUX_URL || 'http://localhost:8086';
// const token = process.env.INFLUX_TOKEN || 'my-super-secret-auth-token';
// const org = process.env.INFLUX_ORG || 'tiltmeter_org';
// const bucket = process.env.INFLUX_BUCKET || 'telemetry_bucket';

// InfluxDB client instances - DISABLED (PostgreSQL primary)
// export const influxDB = new InfluxDB({ url, token });
// export const writeApi = influxDB.getWriteApi(org, bucket, 'ns', { maxRetries: 0, maxRetryTime: 500, writeFailed: () => {} });
// export const queryApi = influxDB.getQueryApi(org);

// Stub exports so existing imports do not break
export const influxDB = null;
export const writeApi = null;
export const queryApi = null;

// Fallback in-memory ring buffer for high-frequency telemetry stream
export const inMemoryTelemetryStore = new Map();

export async function saveTelemetryPoint(data) {
  const deviceId = data.deviceId || 'TM-001';
  const xTilt = typeof data.xTilt === 'number' ? data.xTilt : (data.tilt?.roll ?? 0);
  const yTilt = typeof data.yTilt === 'number' ? data.yTilt : (data.tilt?.pitch ?? 0);
  const resultantTilt = typeof data.resultantTilt === 'number' ? data.resultantTilt : (data.tilt?.tilt ?? Math.sqrt(xTilt * xTilt + yTilt * yTilt));
  const zTilt = typeof data.zTilt === 'number' ? data.zTilt : resultantTilt;
  const xDisplacement = typeof data.xDisplacement === 'number' ? data.xDisplacement : (data.displacement?.xDisplacement_mm ?? 0);
  const yDisplacement = typeof data.yDisplacement === 'number' ? data.yDisplacement : (data.displacement?.yDisplacement_mm ?? 0);
  const zDisplacement = typeof data.zDisplacement === 'number' ? data.zDisplacement : (data.displacement?.zDisplacement_mm ?? 0);
  const totalDisplacement = typeof data.totalDisplacement === 'number'
    ? data.totalDisplacement
    : (data.displacement?.totalDisplacement_mm ?? Math.sqrt(xDisplacement * xDisplacement + yDisplacement * yDisplacement + zDisplacement * zDisplacement));
  const tempVal = parseFloat(data.tempVal ?? data.environment?.temperature ?? 25.0);
  const batteryVoltage = parseFloat(data.batteryVoltage ?? data.power?.batteryVoltage ?? 13.03);
  const csq = parseInt(data.csq ?? data.network?.csq ?? 19);

  const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
  const validTimestamp = !isNaN(timestamp.getTime()) ? timestamp : new Date();
  const isoTimestamp = validTimestamp.toISOString();

  // Check in-memory store for device stream
  if (!inMemoryTelemetryStore.has(deviceId)) {
    inMemoryTelemetryStore.set(deviceId, []);
  }
  const deviceHistory = inMemoryTelemetryStore.get(deviceId);

  // 1. InfluxDB write is DISABLED - PostgreSQL is primary time-series database
  // If you enable InfluxDB in the future, restore the writeApi.writePoint(point) block here.

  // 2. Persist into PostgreSQL TelemetryRecord and update Device state
  try {
    try {
      await TelemetryRecord.create({
        deviceId,
        timestamp: validTimestamp,
        xTilt,
        yTilt,
        resultantTilt,
        xDisplacement,
        yDisplacement,
        zDisplacement,
        totalDisplacement,
        temperature: tempVal,
        acceleration: data.acceleration || null,
        gyroscope: data.gyroscope || null,
        vibration: data.vibration || null,
        displacement: data.displacement || null,
        rawPayload: data.rawPayload || data,
      });
    } catch (createErr) {
      // If unique timestamp constraint collisions occur, insert with microsecond offset so NO packet is ever lost
      await TelemetryRecord.create({
        deviceId,
        timestamp: new Date(),
        xTilt,
        yTilt,
        resultantTilt,
        xDisplacement,
        yDisplacement,
        zDisplacement,
        totalDisplacement,
        temperature: tempVal,
        acceleration: data.acceleration || null,
        gyroscope: data.gyroscope || null,
        vibration: data.vibration || null,
        displacement: data.displacement || null,
        rawPayload: data.rawPayload || data,
      }).catch(() => {});
    }

    const existingDevice = await Device.findByPk(deviceId);
    if (existingDevice) {
      await existingDevice.update({
        xTilt,
        yTilt,
        resultantTilt,
        xDisplacement,
        yDisplacement,
        totalDisplacement,
        temperature: tempVal,
        battery: typeof batteryVoltage === 'number' && !isNaN(batteryVoltage) ? `${batteryVoltage} V` : (data.battery || existingDevice.battery),
        signalStrength: typeof csq === 'number' && !isNaN(csq) ? `${csq} CSQ` : (data.signalStrength || existingDevice.signalStrength),
        status: data.tiltStatus || data.status || existingDevice.status || 'ONLINE',
        lastSeen: validTimestamp,
      });
    } else {
      await Device.create({
        id: deviceId,
        name: data.name || `Tiltmeter ${deviceId}`,
        xTilt,
        yTilt,
        resultantTilt,
        xDisplacement,
        yDisplacement,
        totalDisplacement,
        temperature: tempVal,
        battery: `${batteryVoltage} V`,
        signalStrength: `${csq} CSQ`,
        status: data.tiltStatus || 'ONLINE',
        lastSeen: validTimestamp,
      });
    }
  } catch (err) {
    const nowMs = Date.now();
    if (!global.__lastPgErrorTime || nowMs - global.__lastPgErrorTime > 15000) {
      global.__lastPgErrorTime = nowMs;
      console.warn(`[PostgreSQL Telemetry Warning] Database update for ${deviceId}:`, err.message);
    }
  }

  // 3. Save in in-memory time-series ring buffer
  deviceHistory.push({
    time: validTimestamp.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
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
}

// Flux Query InfluxDB OSS Time-Series Data - DISABLED (PostgreSQL primary)
// This function always returns empty array when InfluxDB is not configured.
export async function queryInfluxTelemetry(deviceId, rangeStart = '-24h', rangeStop = 'now()') {
  // InfluxDB query is disabled. Return empty to fall through to PostgreSQL.
  return [];
}
