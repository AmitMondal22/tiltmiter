import { MaintenanceRecord, Device } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function maintenanceRoutes(fastify) {
  // Get Device Maintenance Records
  fastify.get('/api/maintenance', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    const records = await MaintenanceRecord.findAll({ order: [['performedAt', 'DESC']], limit: 100 });
    return reply.send({ statusCode: 200, records });
  });

  // Log Maintenance Record
  fastify.post('/api/maintenance', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    const { deviceId, type, technicianName, notes, nextDueDate, certificateUrl } = req.body;

    const record = await MaintenanceRecord.create({
      deviceId,
      type,
      technicianName: technicianName || req.user?.fullName || 'Technician',
      notes,
      performedAt: new Date(),
      nextDueDate,
      certificateUrl,
    });

    // Update Device lifecycle status
    const dev = await Device.findByPk(deviceId);
    if (dev) {
      if (type === 'CALIBRATION') {
        await dev.update({ lifecycleStatus: 'ACTIVE', status: 'ONLINE', healthScore: 98 });
      } else if (type === 'BATTERY_REPLACEMENT') {
        await dev.update({ battery: '100%' });
      }
    }

    return reply.status(201).send({ statusCode: 201, message: 'Maintenance log created', record });
  });
}
