import { Device, Site, Structure, Project, Organization } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

export async function devicesRoutes(fastify) {
  // Query devices scoped by organization
  fastify.get('/api/devices', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.organizationId = req.user.organizationId;
        } else {
          return reply.send({ statusCode: 200, devices: [], statusSummary: { online: 0, offline: 0, alarm: 0, total: 0 } });
        }
      }

      const dbDevices = await Device.findAll({
        where,
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

  // Query individual device by ID
  fastify.get('/api/devices/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
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

      if (req.user.role !== 'SUPER_ADMIN' && device.organizationId !== req.user.organizationId) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Access to device denied across tenant boundaries.',
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

  // Create Device (with minimum sleep_count >= 15 validation)
  fastify.post('/api/devices', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ORG_ADMIN' && req.user.role !== 'TECHNICIAN' && req.user.role !== 'ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Administrators or Technicians can register new devices.',
        });
      }

      const {
        id, name, siteId, structureId, projectId, organizationId,
        serialNumber, status, battery, signalStrength, lifecycleStatus,
        imei, simNumber, structureType, floorPierTower, installationPoint,
        elevation, latitude, longitude, baselineTilt, baselineRoll, baselinePitch,
        sleep_count, wake_count, calibrate
      } = req.body;

      const parsedSleep = sleep_count !== undefined ? parseInt(sleep_count) : 15;
      if (parsedSleep < 15) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Sleep count must be at least 15 minutes.'
        });
      }

      const targetOrgId = req.user.role === 'ORG_ADMIN' ? req.user.organizationId : (organizationId || req.user.organizationId || 1);

      const device = await Device.create({
        id: id || `TILTIND${Date.now().toString().slice(-4)}`,
        name: name || `Tilt Meter ${id}`,
        siteId: siteId || 'SITE-KB01',
        structureId: structureId || null,
        projectId: projectId || 1,
        organizationId: targetOrgId,
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
        elevation: elevation !== undefined && elevation !== '' ? parseFloat(elevation) : 18.6,
        latitude: latitude !== undefined && latitude !== '' && latitude !== null ? parseFloat(latitude) : null,
        longitude: longitude !== undefined && longitude !== '' && longitude !== null ? parseFloat(longitude) : null,
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

  // Update Device / Configure
  fastify.put('/api/devices/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (device.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot modify devices belonging to other organizations.',
            });
          }
        }
      }

      if (req.body.sleep_count !== undefined) {
        const parsedSleep = parseInt(req.body.sleep_count);
        if (parsedSleep < 15) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Sleep count must be at least 15 minutes.'
          });
        }
      }

      const updateData = { ...req.body };
      if (req.user.role === 'ORG_ADMIN') {
        updateData.organizationId = req.user.organizationId;
      }
      if (updateData.latitude !== undefined) {
        updateData.latitude = updateData.latitude !== '' && updateData.latitude !== null ? parseFloat(updateData.latitude) : null;
      }
      if (updateData.longitude !== undefined) {
        updateData.longitude = updateData.longitude !== '' && updateData.longitude !== null ? parseFloat(updateData.longitude) : null;
      }

      await device.update(updateData);
      const updated = await Device.findByPk(id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });
      return reply.send({ statusCode: 200, message: 'Device updated successfully', device: updated || device });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Device
  fastify.delete('/api/devices/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (device.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot delete devices belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can delete devices.',
          });
        }
      }

      await device.destroy();
      return reply.send({ statusCode: 200, message: 'Device deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}

