import { Structure, Site, Device, Project, Organization } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

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

      const { siteId, projectId, organizationId, name, type, heightElevation, latitude, longitude, description, status } = req.body;
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
        type: type || 'Crash Barrier',
        heightElevation: heightElevation !== undefined && heightElevation !== '' ? parseFloat(heightElevation) : 15.0,
        latitude: latitude !== undefined && latitude !== '' ? parseFloat(latitude) : 22.5726,
        longitude: longitude !== undefined && longitude !== '' ? parseFloat(longitude) : 88.3639,
        description: description || '',
        status: status || 'ACTIVE',
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
}

