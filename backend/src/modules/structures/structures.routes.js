import { Structure, Site, Device, Project, Organization } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function structuresRoutes(fastify) {
  // Query all structures / assets
  fastify.get('/api/structures', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const structures = await Structure.findAll({
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

  // Create Structure / Asset / Barrier
  fastify.post('/api/structures', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id, siteId, projectId, organizationId, name, code, type, heightElevation, latitude, longitude, description } = req.body;
      const structure = await Structure.create({
        id: id || `STRUCT-${Date.now().toString().slice(-4)}`,
        siteId: siteId || 'SITE-KB01',
        projectId,
        organizationId,
        name,
        code: code || `ST-${Date.now().toString().slice(-4)}`,
        type: type || 'Crash Barrier',
        heightElevation: heightElevation || 15.0,
        latitude: latitude || 22.5726,
        longitude: longitude || 88.3639,
        description: description || '',
      });
      return reply.status(201).send({ statusCode: 201, structure });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Structure / Asset
  fastify.put('/api/structures/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const structure = await Structure.findByPk(id);
      if (!structure) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structure not found' });
      await structure.update(req.body);
      return reply.send({ statusCode: 200, message: 'Structure updated successfully', structure });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Structure
  fastify.delete('/api/structures/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const structure = await Structure.findByPk(id);
      if (!structure) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Structure not found' });
      await structure.destroy();
      return reply.send({ statusCode: 200, message: 'Structure deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}
