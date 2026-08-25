import { Organization, Project, Site } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function organizationsRoutes(fastify) {
  // Query all organizations
  fastify.get('/api/organizations', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const orgs = await Organization.findAll({
        include: [{ model: Project, include: [Site] }],
        order: [['createdAt', 'DESC']],
      });
      return reply.send({ statusCode: 200, organizations: orgs });
    } catch (err) {
      return reply.send({ statusCode: 200, organizations: [] });
    }
  });

  // Create Organization
  fastify.post('/api/organizations', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { name, code, description, partnerId } = req.body;
      const org = await Organization.create({ name, code, description, partnerId });
      return reply.status(201).send({ statusCode: 201, organization: org });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Organization
  fastify.put('/api/organizations/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const org = await Organization.findByPk(id);
      if (!org) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Organization not found' });
      await org.update(req.body);
      return reply.send({ statusCode: 200, message: 'Organization updated successfully', organization: org });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Organization
  fastify.delete('/api/organizations/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const org = await Organization.findByPk(id);
      if (!org) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Organization not found' });
      await org.destroy();
      return reply.send({ statusCode: 200, message: 'Organization deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}
