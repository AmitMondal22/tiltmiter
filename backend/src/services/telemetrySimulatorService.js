import pkg from 'sequelize';
const { Op } = pkg;
import { Device, TelemetryRecord } from '../models/index.js';
import { processAndSaveTelemetry } from '../modules/ingestion/ingestion.service.js';

// Configuration: 16-minute silence threshold
const TIMEOUT_MINUTES = parseInt(process.env.TELEMETRY_TIMEOUT_MINUTES || '16', 10);
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;
const CHECK_INTERVAL_MS = parseInt(process.env.TELEMETRY_CHECK_INTERVAL_MS || '60000', 10); // Checks every 60 seconds

let simulatorIntervalTimer = null;
let simulatorStartupTimer = null;
let isCheckingOverdue = false;

/**
 * Checks all active devices and repeats the last known telemetry for any device
 * that has not sent data within the 16-minute window.
 * DOES NOT generate fake or random numbers — preserves exact last known physical measurements.
 */
export async function checkAndSimulateOverdueDevices() {
  if (isCheckingOverdue) return;
  isCheckingOverdue = true;

  try {
    const devices = await Device.findAll({
      where: {
        lifecycleStatus: { [Op.ne]: 'DECOMMISSIONED' },
      },
    });

    if (!devices || devices.length === 0) {
      return;
    }

    const now = new Date();
    const nowMs = now.getTime();

    for (const device of devices) {
      try {
        const devId = device.id;
        if (!devId) continue;

        // 1. Fetch latest telemetry record for this device (case-insensitive lookup)
        const lastRecord = await TelemetryRecord.findOne({
          where: {
            [Op.or]: [
              { deviceId: devId },
              { deviceId: String(devId).toUpperCase() },
              { deviceId: String(devId).toLowerCase() },
            ],
          },
          order: [['timestamp', 'DESC']],
        });

        // 2. Determine last data timestamp (prefer TelemetryRecord.timestamp, fallback to device.lastSeen)
        let lastTimestampMs = 0;
        if (lastRecord?.timestamp) {
          const t = new Date(lastRecord.timestamp).getTime();
          if (!isNaN(t)) lastTimestampMs = t;
        } else if (device.lastSeen) {
          const t = new Date(device.lastSeen).getTime();
          if (!isNaN(t)) lastTimestampMs = t;
        }

        const elapsedMs = nowMs - lastTimestampMs;

        // 3. Check if device has not sent data under 16 minutes
        if (elapsedMs < TIMEOUT_MS) {
          // Device sent data recently (within 16 minutes), skip
          continue;
        }

        const elapsedMinutes = Math.round(elapsedMs / (60 * 1000));
        console.log(
          `⏱️ [16M TELEMETRY SIMULATOR] Device "${devId}" has not sent data for ${elapsedMinutes}m (>= ${TIMEOUT_MINUTES}m threshold). Repeating last known data with current timestamp.`
        );

        // 4. Construct payload using exact last data — strictly NO random generation
        let simulatedPayload = {};

        if (lastRecord) {
          // Clone existing rawPayload if available to keep schema details intact
          if (lastRecord.rawPayload && typeof lastRecord.rawPayload === 'object') {
            try {
              simulatedPayload = JSON.parse(JSON.stringify(lastRecord.rawPayload));
            } catch (_) {
              simulatedPayload = {};
            }
          }

          // Exact flat readings from last known record
          simulatedPayload.deviceId = devId;
          simulatedPayload.device_id = devId;
          simulatedPayload.timestamp = now.toISOString();
          simulatedPayload.schemaVersion = lastRecord.schemaVersion || 2;
          simulatedPayload.sampleUptimeMs = lastRecord.sampleUptimeMs;

          // Angles & Displacement
          simulatedPayload.xTilt = lastRecord.xTilt;
          simulatedPayload.yTilt = lastRecord.yTilt;
          simulatedPayload.zTilt = lastRecord.zTilt;
          simulatedPayload.yaw = lastRecord.yaw ?? lastRecord.zTilt;
          simulatedPayload.roll = lastRecord.xTilt;
          simulatedPayload.pitch = lastRecord.yTilt;
          simulatedPayload.resultantTilt = lastRecord.resultantTilt;

          simulatedPayload.xDisplacement = lastRecord.xDisplacement;
          simulatedPayload.yDisplacement = lastRecord.yDisplacement;
          simulatedPayload.zDisplacement = lastRecord.zDisplacement;
          simulatedPayload.totalDisplacement = lastRecord.totalDisplacement;
          simulatedPayload.xDisp = lastRecord.xDisplacement;
          simulatedPayload.yDisp = lastRecord.yDisplacement;
          simulatedPayload.zDisp = lastRecord.zDisplacement;
          simulatedPayload.totalDisp = lastRecord.totalDisplacement;

          // Environment, Power, Network
          simulatedPayload.temperature = lastRecord.temperature;
          simulatedPayload.temp = lastRecord.temperature;
          simulatedPayload.batteryVoltage = lastRecord.batteryVoltage;
          simulatedPayload.csq = lastRecord.csq;

          // Motion & Alarm states
          simulatedPayload.rockfallDeltaPeak = lastRecord.rockfallDeltaPeak;
          simulatedPayload.touchVibrationPeak = lastRecord.touchVibrationPeak;
          simulatedPayload.vibrationRMS = lastRecord.vibrationRMS;
          simulatedPayload.motionClassification = lastRecord.motionClassification || 'STABLE';
          simulatedPayload.alarmActive = Boolean(lastRecord.alarmActive);
          simulatedPayload.eventPending = Boolean(lastRecord.eventPending);

          // Nested groups preserved verbatim
          if (lastRecord.tilt) simulatedPayload.tilt = lastRecord.tilt;
          if (lastRecord.angleDelta) simulatedPayload.angleDelta = lastRecord.angleDelta;
          if (lastRecord.angleCurrent) simulatedPayload.angleCurrent = lastRecord.angleCurrent;
          if (lastRecord.angleReference) simulatedPayload.angleReference = lastRecord.angleReference;
          if (lastRecord.displacement) simulatedPayload.displacement = lastRecord.displacement;
          if (lastRecord.environment) simulatedPayload.environment = { ...lastRecord.environment, temperature: lastRecord.temperature };
          if (lastRecord.power) simulatedPayload.power = { ...lastRecord.power, batteryVoltage: lastRecord.batteryVoltage };
          if (lastRecord.network) simulatedPayload.network = { ...lastRecord.network, csq: lastRecord.csq };
          if (lastRecord.acceleration) simulatedPayload.acceleration = lastRecord.acceleration;
          if (lastRecord.accelerationCurrent) simulatedPayload.accelerationCurrent = lastRecord.accelerationCurrent;
          if (lastRecord.accelerationReference) simulatedPayload.accelerationReference = lastRecord.accelerationReference;
          if (lastRecord.accelerationDelta) simulatedPayload.accelerationDelta = lastRecord.accelerationDelta;
          if (lastRecord.gyroscope) simulatedPayload.gyroscope = lastRecord.gyroscope;
          if (lastRecord.vibration) simulatedPayload.vibration = lastRecord.vibration;
          if (lastRecord.calibration) simulatedPayload.calibration = lastRecord.calibration;
          if (lastRecord.rockfallAlarm) simulatedPayload.rockfallAlarm = lastRecord.rockfallAlarm;
          if (lastRecord.motionEvent) simulatedPayload.motionEvent = lastRecord.motionEvent;
          if (lastRecord.monitoringSettings) simulatedPayload.monitoringSettings = lastRecord.monitoringSettings;
          if (lastRecord.units) simulatedPayload.units = lastRecord.units;
        } else {
          // Device has no prior TelemetryRecord in database — use baseline values from Device record
          const parsedBattery = device.battery ? parseFloat(device.battery) : 3.65;
          const parsedCsq = device.signalStrength ? parseInt(device.signalStrength, 10) : 18;

          simulatedPayload = {
            deviceId: devId,
            device_id: devId,
            timestamp: now.toISOString(),
            schemaVersion: 2,
            xTilt: device.xTilt ?? device.baselineTilt ?? 0.0,
            yTilt: device.yTilt ?? device.baselineRoll ?? 0.0,
            zTilt: device.zTilt ?? device.baselinePitch ?? 0.0,
            yaw: device.yaw ?? device.zTilt ?? 0.0,
            roll: device.xTilt ?? device.baselineTilt ?? 0.0,
            pitch: device.yTilt ?? device.baselineRoll ?? 0.0,
            resultantTilt: device.resultantTilt ?? 0.0,
            xDisplacement: device.xDisplacement ?? 0.0,
            yDisplacement: device.yDisplacement ?? 0.0,
            zDisplacement: 0.0,
            totalDisplacement: device.totalDisplacement ?? 0.0,
            temperature: device.temperature ?? 24.5,
            temp: device.temperature ?? 24.5,
            batteryVoltage: !isNaN(parsedBattery) ? parsedBattery : 3.65,
            csq: !isNaN(parsedCsq) ? parsedCsq : 18,
            motionClassification: device.motionClassification || 'STABLE',
            alarmActive: Boolean(device.alarmActive),
            eventPending: false,
          };
        }

        // 5. Store cleanly into PostgreSQL, update in-memory ring buffer, evaluate alerts, and broadcast
        await processAndSaveTelemetry(simulatedPayload, { deviceId: devId });
      } catch (devErr) {
        console.error(`[Telemetry Simulator Error] Failed to process device ${device.id}:`, devErr.message);
      }
    }
  } catch (err) {
    console.error('[Telemetry Simulator Error] Error in check cycle:', err.message);
  } finally {
    isCheckingOverdue = false;
  }
}

/**
 * Starts the automatic 16-minute silence watchdog simulator
 */
export function startTelemetrySimulator() {
  if (process.env.TELEMETRY_SIMULATOR_ENABLED === 'false') {
    console.log('ℹ️ [Telemetry Simulator] Disabled by TELEMETRY_SIMULATOR_ENABLED=false');
    return;
  }

  if (simulatorIntervalTimer) {
    clearInterval(simulatorIntervalTimer);
  }
  if (simulatorStartupTimer) {
    clearTimeout(simulatorStartupTimer);
  }

  console.log(`📡 [Telemetry Simulator] Initialized: Watching for devices silent > ${TIMEOUT_MINUTES} minutes (Checking every ${CHECK_INTERVAL_MS / 1000}s)...`);

  // Initial sweep 10 seconds after server boot
  simulatorStartupTimer = setTimeout(() => {
    checkAndSimulateOverdueDevices().catch((e) => {
      console.warn('[Telemetry Simulator] Startup sweep error:', e.message);
    });
  }, 10000);

  // Periodic interval check
  simulatorIntervalTimer = setInterval(() => {
    checkAndSimulateOverdueDevices().catch((e) => {
      console.warn('[Telemetry Simulator] Interval check error:', e.message);
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Stops the simulator timer cleanly for graceful shutdown
 */
export function stopTelemetrySimulator() {
  if (simulatorStartupTimer) {
    clearTimeout(simulatorStartupTimer);
    simulatorStartupTimer = null;
  }
  if (simulatorIntervalTimer) {
    clearInterval(simulatorIntervalTimer);
    simulatorIntervalTimer = null;
    console.log('🛑 [Telemetry Simulator] Stopped.');
  }
}

