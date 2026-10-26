import { processAndSaveTelemetry } from './ingestion.service.js';
import { Device } from '../../models/Device.js';

export async function receiveTelemetryHandler(req, reply) {
  try {
    const rawPayload = req.body || {};
    const targetDeviceId = req.params?.deviceId || req.query?.deviceId || rawPayload.deviceId || rawPayload.device_id || 'ABCDEF0002';
    const params = { deviceId: targetDeviceId };

    const result = await processAndSaveTelemetry(rawPayload, params);
    const deviceId = result.deviceId || targetDeviceId;

    // Retrieve active device settings from database
    let devObj = null;
    try {
      if (Device && typeof Device.findByPk === 'function') {
        devObj = await Device.findByPk(deviceId);
      }
    } catch (e) {}

    // Exact response format returned to hardware device
    return reply.status(200).send({
      success: true,
      device_id: deviceId,
      settings: {
        sleep_count: devObj?.sleep_count ?? 15, // Minutes
        wake_count: devObj?.wake_count ?? 30,   // Seconds
        calibrate: Boolean(devObj?.calibrate ?? false)   // true / false
      }
    });
  } catch (err) {
    return reply.status(500).send({
      success: false,
      error: 'Ingestion Error',
      message: err.message
    });
  }
}
