import { Site, Project, Device, Organization, Structure } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

export async function sitesRoutes(fastify) {
  // Query sites scoped by organization
  fastify.get('/api/sites', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.organizationId = req.user.organizationId;
        } else {
          return reply.send({ statusCode: 200, sites: [], structures: [] });
        }
      }

      const dbSites = await Site.findAll({
        where,
        include: [
          {
            model: Project,
            include: [Organization]
          },
          Device,
          Structure
        ],
        order: [['createdAt', 'DESC']],
      });

      const structWhere = {};
      if (req.user.role !== 'SUPER_ADMIN' && req.user.organizationId) {
        structWhere.organizationId = req.user.organizationId;
      }
      const dbStructures = await Structure.findAll({ where: structWhere }).catch(() => []);

      return reply.send({
        statusCode: 200,
        sites: dbSites || [],
        structures: dbStructures || []
      });
    } catch (err) {
      return reply.send({ statusCode: 200, sites: [], structures: [] });
    }
  });

  // Create Site (Backend automatically generates numeric Site ID)
  fastify.post('/api/sites', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ORG_ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Administrators can create new site locations.',
        });
      }

      const { name, code, projectId, organizationId, address, location, latitude, longitude, elevation, description, status } = req.body;
      const targetOrgId = req.user.role === 'ORG_ADMIN' ? req.user.organizationId : (organizationId || req.user.organizationId || 1);

      // Backend generates sequential numeric Site ID (e.g. 1001, 1002, ...)
      let nextNumericId = '1001';
      try {
        const allSites = await Site.findAll({ attributes: ['id'] });
        let maxNum = 1000;
        for (const s of allSites) {
          const parsed = parseInt(s.id, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
        nextNumericId = String(maxNum + 1);
      } catch (err) {
        nextNumericId = String(Date.now()).slice(-6);
      }

      const site = await Site.create({
        id: nextNumericId,
        siteId: nextNumericId,
        name: name || `Site ${nextNumericId}`,
        code: code || nextNumericId,
        projectId: projectId || 1,
        organizationId: targetOrgId,
        address: address || '',
        location: location || '',
        latitude: latitude !== undefined && latitude !== '' ? parseFloat(latitude) : 22.5726,
        longitude: longitude !== undefined && longitude !== '' ? parseFloat(longitude) : 88.3639,
        elevation: elevation !== undefined && elevation !== '' ? parseFloat(elevation) : 18.6,
        description: description || '',
        status: status || 'ACTIVE',
      });

      const loadedSite = await Site.findByPk(site.id, {
        include: [{ model: Project, include: [Organization] }, Device, Structure]
      });

      return reply.status(201).send({ statusCode: 201, site: loadedSite || site });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Site (Backend handles update via ID parameter)
  fastify.put('/api/sites/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const site = await Site.findByPk(id);
      if (!site) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Site not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (site.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot modify sites belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can update site locations.',
          });
        }
      }

      const updateData = { ...req.body };
      // Prevent changing numeric primary key
      delete updateData.id;
      delete updateData.siteId;

      if (req.user.role === 'ORG_ADMIN') {
        updateData.organizationId = req.user.organizationId;
      }
      if (updateData.latitude !== undefined && updateData.latitude !== '') {
        updateData.latitude = parseFloat(updateData.latitude);
      }
      if (updateData.longitude !== undefined && updateData.longitude !== '') {
        updateData.longitude = parseFloat(updateData.longitude);
      }
      if (updateData.elevation !== undefined && updateData.elevation !== '') {
        updateData.elevation = parseFloat(updateData.elevation);
      }

      await site.update(updateData);
      const loaded = await Site.findByPk(id, {
        include: [{ model: Project, include: [Organization] }, Device, Structure]
      });

      return reply.send({ statusCode: 200, message: 'Site updated successfully', site: loaded || site });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Site (Backend handles deletion and nullifies associations)
  fastify.delete('/api/sites/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const site = await Site.findByPk(id);
      if (!site) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Site not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (site.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot delete sites belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can delete site locations.',
          });
        }
      }

      // Detach related devices and structures cleanly
      await Device.update({ siteId: null }, { where: { siteId: id } }).catch(() => {});
      await Structure.update({ siteId: null }, { where: { siteId: id } }).catch(() => {});

      await site.destroy();
      return reply.send({ statusCode: 200, message: 'Site deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}

