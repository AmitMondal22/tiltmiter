import { Device, Site, Structure, Project, Organization } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function devicesRoutes(fastify) {
  // Query all devices
  fastify.get('/api/devices', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const dbDevices = await Device.findAll({
        include: [
          {
            model: Site,
            include: [Project, Organization]
          },
          Structure
        ],
        order: [['id', 'ASC']],
      });

      const onlineCount = dbDevices.filter(d => d.status === 'ONLINE').length;
      const offlineCount = dbDevices.filter(d => d.status === 'OFFLINE').length;
      const alarmCount = dbDevices.filter(d => d.status === 'ALARM' || d.status === 'WARNING').length;

      return reply.send({
        statusCode: 200,
        devices: dbDevices || [],
        statusSummary: { online: onlineCount, offline: offlineCount, alarm: alarmCount, total: dbDevices.length }
      });
    } catch (err) {
      return reply.send({
        statusCode: 200,
        devices: [],
        statusSummary: { online: 0, offline: 0, alarm: 0, total: 0 }
      });
    }
  });

  // Query individual device by ID (for individual device dashboard)
  fastify.get('/api/devices/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id, {
        include: [
          {
            model: Site,
            include: [Project, Organization]
          },
          Structure
        ]
      });
      if (!device) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Device with ID ${id} not found.`
        });
      }
      return reply.send({
        statusCode: 200,
        device
      });
    } catch (err) {
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  // Create Device (with minimum sleep_count >= 60 validation)
  fastify.post('/api/devices', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const {
        id, name, siteId, structureId, projectId, organizationId,
        serialNumber, status, battery, signalStrength, lifecycleStatus,
        imei, simNumber, structureType, floorPierTower, installationPoint,
        elevation, latitude, longitude, baselineTilt, baselineRoll, baselinePitch,
        sleep_count, wake_count, calibrate
      } = req.body;

      const parsedSleep = sleep_count !== undefined ? parseInt(sleep_count) : 60;
      if (parsedSleep < 60) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Sleep count must be at least 60 minutes.'
        });
      }

      const device = await Device.create({
        id: id || `TILTIND${Date.now().toString().slice(-4)}`,
        name: name || `Tilt Meter ${id}`,
        siteId: siteId || 'SITE-KB01',
        structureId: structureId || null,
        projectId: projectId || 1,
        organizationId: organizationId || 1,
        serialNumber: serialNumber || `SN-98210-${Date.now().toString().slice(-4)}`,
        status: status || 'ONLINE',
        battery: battery || '100%',
        signalStrength: signalStrength || '-60 dBm',
        lifecycleStatus: lifecycleStatus || 'ACTIVE',
        imei: imei || '',
        simNumber: simNumber || '',
        structureType: structureType || 'Crash Barrier',
        floorPierTower: floorPierTower || 'Section-01',
        installationPoint: installationPoint || 'Point-A',
        elevation: elevation !== undefined ? parseFloat(elevation) : 18.6,
        latitude: latitude !== undefined ? parseFloat(latitude) : 22.5726,
        longitude: longitude !== undefined ? parseFloat(longitude) : 88.3639,
        baselineTilt: baselineTilt !== undefined ? parseFloat(baselineTilt) : 0.15,
        baselineRoll: baselineRoll !== undefined ? parseFloat(baselineRoll) : 0.05,
        baselinePitch: baselinePitch !== undefined ? parseFloat(baselinePitch) : 0.02,
        sleep_count: parsedSleep,
        wake_count: wake_count !== undefined ? parseInt(wake_count) : 30,
        calibrate: calibrate !== undefined ? Boolean(calibrate) : false,
      });

      const loadedDevice = await Device.findByPk(device.id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });

      return reply.status(201).send({ statusCode: 201, message: 'Device registered successfully', device: loadedDevice || device });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Device / Configure (with minimum sleep_count >= 60 validation)
  fastify.put('/api/devices/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      if (req.body.sleep_count !== undefined) {
        const parsedSleep = parseInt(req.body.sleep_count);
        if (parsedSleep < 60) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Sleep count must be at least 60 minutes.'
          });
        }
      }

      await device.update(req.body);
      const updated = await Device.findByPk(id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });
      return reply.send({ statusCode: 200, message: 'Device updated successfully', device: updated || device });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Device
  fastify.delete('/api/devices/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });
      await device.destroy();
      return reply.send({ statusCode: 200, message: 'Device deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}
