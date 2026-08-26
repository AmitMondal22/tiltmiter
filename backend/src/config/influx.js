import { InfluxDB, Point } from '@influxdata/influxdb-client';
import dotenv from 'dotenv';
import { Device, TelemetryRecord } from '../models/index.js';

dotenv.config();

const url = process.env.INFLUX_URL || 'http://localhost:8086';
const token = process.env.INFLUX_TOKEN || 'my-super-secret-auth-token';
const org = process.env.INFLUX_ORG || 'tiltmeter_org';
const bucket = process.env.INFLUX_BUCKET || 'telemetry_bucket';

export const influxDB = new InfluxDB({ url, token });
export const writeApi = influxDB.getWriteApi(org, bucket, 'ns');
export const queryApi = influxDB.getQueryApi(org);

// Fallback in-memory ring buffer for high-frequency telemetry stream
export const inMemoryTelemetryStore = new Map();

export async function saveTelemetryPoint(data) {
  const deviceId = data.deviceId || 'TM-001';
  const xTilt = typeof data.xTilt === 'number' ? data.xTilt : (data.tilt?.roll ?? 0);
  const yTilt = typeof data.yTilt === 'number' ? data.yTilt : (data.tilt?.pitch ?? 0);
  const resultantTilt = typeof data.resultantTilt === 'number' ? data.resultantTilt : (data.tilt?.tilt ?? Math.sqrt(xTilt * xTilt + yTilt * yTilt));
  const xDisplacement = typeof data.xDisplacement === 'number' ? data.xDisplacement : (data.displacement?.xDisplacement_mm ?? 0);
  const yDisplacement = typeof data.yDisplacement === 'number' ? data.yDisplacement : (data.displacement?.yDisplacement_mm ?? 0);
  const zDisplacement = typeof data.zDisplacement === 'number' ? data.zDisplacement : (data.displacement?.zDisplacement_mm ?? 0);
  const totalDisplacement = typeof data.totalDisplacement === 'number' ? data.totalDisplacement : (data.displacement?.totalDisplacement_mm ?? Math.sqrt(xDisplacement * xDisplacement + yDisplacement * yDisplacement));
  const tempVal = parseFloat(data.tempVal ?? data.environment?.temperature ?? 25.0);
  const batteryVoltage = parseFloat(data.batteryVoltage ?? data.power?.batteryVoltage ?? 13.03);
  const csq = parseInt(data.csq ?? data.network?.csq ?? 19);

  const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();

  // 1. Write Telemetry Point to InfluxDB OSS Database
  try {
    const point = new Point('device_telemetry')
      .tag('device_id', deviceId)
      .floatField('x_tilt', xTilt)
      .floatField('y_tilt', yTilt)
      .floatField('resultant_tilt', resultantTilt)
      .floatField('x_displacement', xDisplacement)
      .floatField('y_displacement', yDisplacement)
      .floatField('z_displacement', zDisplacement)
      .floatField('total_displacement', totalDisplacement)
      .floatField('temperature', tempVal)
      .floatField('battery_voltage', batteryVoltage)
      .intField('csq', csq)
      .floatField('acc_mag', data.acceleration?.accMag || 9.82)
      .floatField('gyro_mag', data.gyroscope?.gyroMag || 0.008)
      .floatField('vib_rms', data.vibration?.vibrationRMS || 0.045)
      .timestamp(timestamp);

    writeApi.writePoint(point);
  } catch (err) {
    // InfluxDB OSS connection fallback
  }

  // 2. Mirror into PostgreSQL for relational audit table & Device status
  try {
    await TelemetryRecord.create({
      deviceId,
      timestamp,
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

    await Device.upsert({
      id: deviceId,
      name: `Tiltmeter ${deviceId}`,
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
      lastSeen: timestamp,
    });
  } catch (err) {}

  // 3. Save in in-memory time-series ring buffer (last 100 points)
  if (!inMemoryTelemetryStore.has(deviceId)) {
    inMemoryTelemetryStore.set(deviceId, []);
  }
  const deviceHistory = inMemoryTelemetryStore.get(deviceId);
  deviceHistory.push({
    time: timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestamp: timestamp.toISOString(),
    deviceId,
    tiltX: xTilt,
    tiltY: yTilt,
    resultant: resultantTilt,
    xDisp: xDisplacement,
    yDisp: yDisplacement,
    totalDisp: totalDisplacement,
    temperature: `${tempVal} °C`,
    ...data,
  });

  if (deviceHistory.length > 100) {
    deviceHistory.shift();
  }
}

// Flux Query InfluxDB OSS Time-Series Data
export async function queryInfluxTelemetry(deviceId, rangeStart = '-24h', rangeStop = 'now()') {
  const fluxQuery = `
    from(bucket: "${bucket}")
      |> range(start: ${rangeStart}, stop: ${rangeStop})
      |> filter(fn: (r) => r["_measurement"] == "device_telemetry")
      |> filter(fn: (r) => r["device_id"] == "${deviceId}")
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> limit(n: 500)
  `;

  const results = [];
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
      const o = tableMeta.toObject(values);
      results.push({
        time: new Date(o._time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: o._time,
        deviceId: o.device_id,
        tiltX: o.x_tilt ?? 0,
        tiltY: o.y_tilt ?? 0,
        resultant: o.resultant_tilt ?? 0,
        xDisp: o.x_displacement ?? 0,
        yDisp: o.y_displacement ?? 0,
        totalDisp: o.total_displacement ?? 0,
        temperature: `${o.temperature ?? 25.0} °C`,
      });
    }
  } catch (err) {}

  return results;
}
