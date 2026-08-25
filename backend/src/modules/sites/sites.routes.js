import { Site, Project, Device, Organization, Structure } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function sitesRoutes(fastify) {
  // Query all sites
  fastify.get('/api/sites', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const dbSites = await Site.findAll({
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
      const dbStructures = await Structure.findAll().catch(() => []);

      return reply.send({
        statusCode: 200,
        sites: dbSites || [],
        structures: dbStructures || []
      });
    } catch (err) {
      return reply.send({ statusCode: 200, sites: [], structures: [] });
    }
  });

  // Create Site
  fastify.post('/api/sites', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id, name, code, projectId, organizationId, address, location, latitude, longitude, elevation } = req.body;
      const site = await Site.create({
        id: id || `SITE-${Date.now().toString().slice(-4)}`,
        name,
        code: code || `SITE-${Date.now().toString().slice(-4)}`,
        projectId: projectId || 1,
        organizationId: organizationId || 1,
        address: address || '',
        location: location || '',
        latitude: latitude !== undefined ? parseFloat(latitude) : 22.5726,
        longitude: longitude !== undefined ? parseFloat(longitude) : 88.3639,
        elevation: elevation !== undefined ? parseFloat(elevation) : 18.6,
      });
      return reply.status(201).send({ statusCode: 201, site });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Site
  fastify.put('/api/sites/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const site = await Site.findByPk(id);
      if (!site) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Site not found' });
      await site.update(req.body);
      return reply.send({ statusCode: 200, message: 'Site updated successfully', site });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Site
  fastify.delete('/api/sites/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const site = await Site.findByPk(id);
      if (!site) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Site not found' });
      await site.destroy();
      return reply.send({ statusCode: 200, message: 'Site deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}
