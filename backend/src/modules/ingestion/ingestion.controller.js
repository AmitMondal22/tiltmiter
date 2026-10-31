import { processAndSaveTelemetry } from './ingestion.service.js';
import { Device } from '../../models/Device.js';
import pkg from 'sequelize';
const { Op } = pkg;

export async function receiveTelemetryHandler(req, reply) {
  try {
    const rawPayload = req.body || {};
    let targetDeviceId = req.params?.deviceId || req.query?.deviceId || rawPayload.deviceId || rawPayload.device_id || rawPayload.id || req.headers?.['x-device-id'] || req.headers?.deviceid || req.headers?.['device-id'];

    if (!targetDeviceId) {
      const activeDev = await Device.findOne({ order: [['lastSeen', 'DESC NULLS LAST'], ['createdAt', 'DESC']] }).catch(() => null);
      targetDeviceId = activeDev?.id || 'TM-001';
    }
    const params = { deviceId: targetDeviceId };

    console.log('\n================================================================');
    console.log('📥 [DATA PACKET RECEIVED FROM SENSOR / HARDWARE]');
    console.log(`⏱️  Timestamp : ${new Date().toISOString()}`);
    console.log(`📍 Device ID : ${targetDeviceId}`);
    console.log(`🌐 Route     : ${req.method} ${req.url}`);
    console.log(`📡 Client IP : ${req.ip || req.socket?.remoteAddress || 'Unknown'}`);
    console.log('📦 Received Data Packet:');
    console.dir(rawPayload, { depth: null, colors: true });
    console.log('================================================================\n');

    const result = await processAndSaveTelemetry(rawPayload, params);
    const deviceId = result.deviceId || targetDeviceId;

    // Retrieve active device settings from database (with case-insensitive fallback)
    let devObj = null;
    try {
      if (Device && typeof Device.findByPk === 'function') {
        devObj = await Device.findByPk(deviceId);
        if (!devObj && Op) {
          devObj = await Device.findOne({
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

    const isCalibrated = devObj ? Boolean(devObj.calibrate ?? devObj.hasReferenceZero ?? false) : false;
    const devSettings = devObj?.monitoringSettings || rawPayload.monitoringSettings || {};

    // Exact response format returned to hardware device as documented in Section 9
    const responsePayload = {
      success: true,
      device_id: devObj?.id || deviceId,
      settings: {
        sleep_count: devObj?.sleep_count !== undefined && devObj?.sleep_count !== null ? devObj.sleep_count : (devSettings.uploadIntervalMinutes || 15),
        wake_count: devObj?.wake_count !== undefined && devObj?.wake_count !== null ? devObj.wake_count : 30,
        calibrate: isCalibrated,
        debug: devSettings.debug !== undefined ? Boolean(devSettings.debug) : true,
        thresholds: {
          rockfall_on: typeof devSettings.rockfall_on === 'number' ? devSettings.rockfall_on : 12.0,
          rockfall_off: typeof devSettings.rockfall_off === 'number' ? devSettings.rockfall_off : 3.0,
          landslide_on: typeof devSettings.landslide_on === 'number' ? devSettings.landslide_on : 15.0,
          landslide_off: typeof devSettings.landslide_off === 'number' ? devSettings.landslide_off : 5.0,
          landslide_seconds: typeof devSettings.landslide_seconds === 'number' ? devSettings.landslide_seconds : 5,
          human_touch_on: typeof devSettings.human_touch_on === 'number' ? devSettings.human_touch_on : 5.0,
          human_touch_off: typeof devSettings.human_touch_off === 'number' ? devSettings.human_touch_off : 1.5,
          air_wind_on: typeof devSettings.air_wind_on === 'number' ? devSettings.air_wind_on : 0.8,
          air_wind_off: typeof devSettings.air_wind_off === 'number' ? devSettings.air_wind_off : 0.25,
          air_wind_seconds: typeof devSettings.air_wind_seconds === 'number' ? devSettings.air_wind_seconds : 12,
          normal_seconds: typeof devSettings.normal_seconds === 'number' ? devSettings.normal_seconds : 10,
        }
      }
    };

    console.log('\n================================================================');
    console.log('📤 [DATA PACKET SENT TO SENSOR / HARDWARE (RESPONSE)]');
    console.log(`⏱️  Timestamp : ${new Date().toISOString()}`);
    console.log(`📍 Device ID : ${responsePayload.device_id}`);
    console.log('📦 Sent Response Packet:');
    console.dir(responsePayload, { depth: null, colors: true });
    console.log('================================================================\n');

    return reply.status(200).send(responsePayload);
  } catch (err) {
    console.error('❌ [INGESTION ERROR] Failed to process telemetry packet:', err);
    return reply.status(500).send({
      success: false,
      error: 'Ingestion Error',
      message: err.message
    });
  }
}
