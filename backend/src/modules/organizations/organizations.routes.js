import { Organization, Project, Site } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

export async function organizationsRoutes(fastify) {
  // Query organizations (Super Admin sees all; Org Admin and others see only their own)
  fastify.get('/api/organizations', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.id = req.user.organizationId;
        } else {
          return reply.send({ statusCode: 200, organizations: [] });
        }
      }

      const orgs = await Organization.findAll({
        where,
        include: [{ model: Project, include: [Site] }],
        order: [['createdAt', 'DESC']],
      });
      return reply.send({ statusCode: 200, organizations: orgs });
    } catch (err) {
      return reply.send({ statusCode: 200, organizations: [] });
    }
  });

  // Create Organization (Super Admin only)
  fastify.post('/api/organizations', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Super Administrators can create new Enterprise Organizations.',
        });
      }

      const { name, code, description, partnerId, address, contactEmail, status } = req.body;
      const org = await Organization.create({
        name,
        code: code || `ORG-${Date.now().toString().slice(-4)}`,
        description: description || '',
        partnerId: partnerId || null,
        address: address || '',
        contactEmail: contactEmail || '',
        status: status || 'ACTIVE',
      });
      return reply.status(201).send({ statusCode: 201, organization: org });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Organization (Super Admin or Org Admin for own org)
  fastify.put('/api/organizations/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const org = await Organization.findByPk(id);
      if (!org) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Organization not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (parseInt(id) !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Organization Admins can only edit their own organization profile.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You do not have permission to modify organization settings.',
          });
        }
      }

      await org.update(req.body);
      return reply.send({ statusCode: 200, message: 'Organization updated successfully', organization: org });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Organization (Super Admin only)
  fastify.delete('/api/organizations/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Super Administrators can delete Organizations.',
        });
      }

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

