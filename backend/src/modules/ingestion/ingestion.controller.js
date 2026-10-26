import { processAndSaveTelemetry } from './ingestion.service.js';
import { Device } from '../../models/Device.js';
import pkg from 'sequelize';
const { Op } = pkg;

export async function receiveTelemetryHandler(req, reply) {
  try {
    const rawPayload = req.body || {};
    const targetDeviceId = req.params?.deviceId || req.query?.deviceId || rawPayload.deviceId || rawPayload.device_id || 'ABCDEF0002';
    const params = { deviceId: targetDeviceId };

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

    // Exact response format returned to hardware device
    return reply.status(200).send({
      success: true,
      device_id: devObj?.id || deviceId,
      settings: {
        sleep_count: devObj?.sleep_count !== undefined && devObj?.sleep_count !== null ? devObj.sleep_count : 15, // Minutes
        wake_count: devObj?.wake_count !== undefined && devObj?.wake_count !== null ? devObj.wake_count : 30,     // Seconds
        calibrate: isCalibrated                                                                                   // true / false
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
