import { Op } from 'sequelize';
import { Structure, Site, Device, Project, Organization } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';
import { invalidateDevicesCache } from '../devices/devices.routes.js';

export async function structuresRoutes(fastify) {
  // Query structures / assets scoped by organization
  fastify.get('/api/structures', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.organizationId = req.user.organizationId;
        } else {
          return reply.send({ statusCode: 200, structures: [] });
        }
      }

      const structures = await Structure.findAll({
        where,
        include: [
          {
            model: Site,
            include: [Project, Organization]
          },
          Device
        ],
        order: [['createdAt', 'DESC']],
      });
      return reply.send({ statusCode: 200, structures: structures || [] });
    } catch (err) {
      return reply.send({ statusCode: 200, structures: [] });
    }
  });

  // Query single structure / asset by ID
  fastify.get('/api/structures/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      let structure = await Structure.findByPk(id, {
        include: [
          {
            model: Site,
            include: [Project, Organization]
          },
          Device
        ]
      });
      if (!structure) {
        structure = await Structure.findOne({
          where: {
            [Op.or]: [
              { id },
              { code: id },
              { name: id }
            ]
          },
          include: [
            {
              model: Site,
              include: [Project, Organization]
            },
            Device
          ]
        });
      }
      if (!structure) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structure not found' });
      }
      return reply.send({ statusCode: 200, structure });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Create Structure / Asset / Barrier (Backend automatically generates numeric ID)
  fastify.post('/api/structures', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ORG_ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Administrators can create new structure assets.',
        });
      }

      const { siteId, projectId, organizationId, name, type, heightElevation, latitude, longitude, description, status, polygon, polygonColor } = req.body;
      const cleanPolygon = Array.isArray(polygon)
        ? polygon
            .map(pt => ({ lat: parseFloat(pt?.lat), lng: parseFloat(pt?.lng) }))
            .filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lng))
        : [];
      const targetOrgId = req.user.role === 'ORG_ADMIN' ? req.user.organizationId : (organizationId || req.user.organizationId || 1);

      // Backend generates sequential numeric Asset / Structure ID (e.g. 1001, 1002, ...)
      let nextNumericId = '1001';
      try {
        const allStructures = await Structure.findAll({ attributes: ['id'] });
        let maxNum = 1000;
        for (const st of allStructures) {
          const parsed = parseInt(st.id, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
        nextNumericId = String(maxNum + 1);
      } catch (err) {
        nextNumericId = String(Date.now()).slice(-6);
      }

      const structure = await Structure.create({
        id: nextNumericId,
        code: nextNumericId,
        siteId: siteId || null,
        projectId: projectId || 1,
        organizationId: targetOrgId,
        name: name || `Asset ${nextNumericId}`,
        type: type || 'Mountain Slope',
        heightElevation: heightElevation !== undefined && heightElevation !== '' ? parseFloat(heightElevation) : 15.0,
        latitude: latitude !== undefined && latitude !== '' ? parseFloat(latitude) : 22.5726,
        longitude: longitude !== undefined && longitude !== '' ? parseFloat(longitude) : 88.3639,
        description: description || '',
        status: status || 'ACTIVE',
        polygon: cleanPolygon,
        polygonColor: polygonColor || '#7c3aed',
      });

      const loadedStructure = await Structure.findByPk(structure.id, {
        include: [{ model: Site, include: [Project, Organization] }, Device]
      });

      return reply.status(201).send({ statusCode: 201, structure: loadedStructure || structure });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Structure / Asset (Backend handles update via ID parameter)
  fastify.put('/api/structures/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const structure = await Structure.findByPk(id);
      if (!structure) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structure not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (structure.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot modify structures belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can modify structure assets.',
          });
        }
      }

      const updateData = { ...req.body };
      // Prevent changing numeric primary key or code
      delete updateData.id;
      delete updateData.code;

      if (Array.isArray(updateData.polygon)) {
        updateData.polygon = updateData.polygon
          .map(pt => ({ lat: parseFloat(pt?.lat), lng: parseFloat(pt?.lng) }))
          .filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));
      }

      if (req.user.role === 'ORG_ADMIN') {
        updateData.organizationId = req.user.organizationId;
      }

      await structure.update(updateData);
      const loaded = await Structure.findByPk(id, {
        include: [{ model: Site, include: [Project, Organization] }, Device]
      });

      return reply.send({ statusCode: 200, message: 'Structure updated successfully', structure: loaded || structure });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Save polygon boundary points for a Structural Asset
  fastify.put('/api/structures/:id/polygon', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const structure = await Structure.findByPk(id);
      if (!structure) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structure not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (structure.organizationId !== req.user.organizationId) {
            return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Cannot modify structures belonging to other organizations.' });
          }
        } else {
          return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Only Administrators can modify structure polygons.' });
        }
      }

      const rawPolygon = Array.isArray(req.body?.polygon) ? req.body.polygon : [];
      const cleanPolygon = rawPolygon
        .map(pt => ({ lat: parseFloat(pt?.lat), lng: parseFloat(pt?.lng) }))
        .filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));

      const updateFields = { polygon: cleanPolygon };
      if (req.body?.polygonColor) {
        updateFields.polygonColor = String(req.body.polygonColor);
      }

      await structure.update(updateFields);
      const loaded = await Structure.findByPk(id, {
        include: [{ model: Site, include: [Project, Organization] }, Device]
      });

      return reply.send({
        statusCode: 200,
        message: `Saved ${cleanPolygon.length} polygon point(s) for ${structure.name}`,
        structure: loaded || structure,
      });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Structure (Backend handles deletion and nullifies device associations)
  fastify.delete('/api/structures/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const structure = await Structure.findByPk(id);
      if (!structure) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structure not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (structure.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot delete structures belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can delete structures.',
          });
        }
      }

      // Detach related devices cleanly before deleting structure
      await Device.update({ structureId: null }, { where: { structureId: id } }).catch(() => {});

      await structure.destroy();
      return reply.send({ statusCode: 200, message: 'Structure deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update a device's GPS location under a specific Structural Asset
  fastify.put('/api/structures/:id/devices/:deviceId/location', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id, deviceId } = req.params;
      const { latitude, longitude } = req.body || {};

      const parsedLat = latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null;
      const parsedLng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null;

      if (parsedLat === null || isNaN(parsedLat) || parsedLng === null || isNaN(parsedLng)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Valid numeric latitude and longitude are required.',
        });
      }

      const structure = await Structure.findByPk(id);
      if (!structure) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structural asset not found' });
      }

      let device = await Device.findByPk(deviceId);
      if (!device) {
        device = await Device.findOne({
          where: {
            [Op.or]: [
              { id: deviceId },
              { id: String(deviceId).toUpperCase() },
              { id: String(deviceId).toLowerCase() }
            ]
          }
        });
      }
      if (!device) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });
      }

      if (req.user.role !== 'SUPER_ADMIN' && req.user.role === 'ORG_ADMIN') {
        if (device.organizationId && device.organizationId !== req.user.organizationId) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Cannot modify devices belonging to other organizations.',
          });
        }
      }

      await device.update({
        latitude: parsedLat,
        longitude: parsedLng,
        structureId: device.structureId || structure.id,
        siteId: device.siteId || structure.siteId || null,
      });

      const updatedDevice = await Device.findByPk(device.id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });

      invalidateDevicesCache();
      return reply.send({
        statusCode: 200,
        message: 'Device location updated successfully',
        device: updatedDevice || device,
      });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Bulk update GPS locations for multiple/all devices under a Structural Asset
  fastify.put('/api/structures/:id/devices/locations', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

      if (updates.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'At least one device location update is required.',
        });
      }

      const structure = await Structure.findByPk(id);
      if (!structure) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structural asset not found' });
      }

      const updatedDevices = [];
      for (const item of updates) {
        const devId = item?.deviceId || item?.id;
        const parsedLat = item?.latitude !== undefined && item?.latitude !== null && item?.latitude !== '' ? parseFloat(item.latitude) : null;
        const parsedLng = item?.longitude !== undefined && item?.longitude !== null && item?.longitude !== '' ? parseFloat(item.longitude) : null;
        if (!devId || parsedLat === null || isNaN(parsedLat) || parsedLng === null || isNaN(parsedLng)) continue;

        let device = await Device.findByPk(devId);
        if (!device) {
          device = await Device.findOne({
            where: {
              [Op.or]: [
                { id: devId },
                { id: String(devId).toUpperCase() },
                { id: String(devId).toLowerCase() }
              ]
            }
          });
        }
        if (!device) continue;

        if (req.user.role !== 'SUPER_ADMIN' && req.user.role === 'ORG_ADMIN') {
          if (device.organizationId && device.organizationId !== req.user.organizationId) continue;
        }

        await device.update({
          latitude: parsedLat,
          longitude: parsedLng,
          structureId: device.structureId || structure.id,
          siteId: device.siteId || structure.siteId || null,
        });

        const loaded = await Device.findByPk(device.id, {
          include: [{ model: Site, include: [Project, Organization] }, Structure]
        });
        updatedDevices.push(loaded || device);
      }

      invalidateDevicesCache();
      return reply.send({
        statusCode: 200,
        message: `Updated locations for ${updatedDevices.length} device(s).`,
        devices: updatedDevices,
      });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}

