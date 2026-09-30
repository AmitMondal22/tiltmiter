import { Organization, Project, Site } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

const MAX_LOGO_SIZE_BYTES = 2.5 * 1024 * 1024; // 2.5MB maximum size limit

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

  // Query current organization logo
  fastify.get('/api/organizations/logo', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const orgId = req.user.organizationId;
      if (!orgId) {
        return reply.send({ statusCode: 200, logoUrl: null });
      }
      const org = await Organization.findByPk(orgId, { attributes: ['id', 'name', 'logoUrl'] });
      return reply.send({ statusCode: 200, logoUrl: org?.logoUrl || null, organization: org });
    } catch (err) {
      return reply.send({ statusCode: 200, logoUrl: null });
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

      const { name, code, description, partnerId, address, contactEmail, logoUrl, status } = req.body;
      const org = await Organization.create({
        name,
        code: code || `ORG-${Date.now().toString().slice(-4)}`,
        description: description || '',
        partnerId: partnerId || null,
        address: address || '',
        contactEmail: contactEmail || '',
        logoUrl: logoUrl || null,
        status: status || 'ACTIVE',
      });
      return reply.status(201).send({ statusCode: 201, organization: org });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Upload or update Custom Logo for Organization
  fastify.post('/api/organizations/:id/logo', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const org = await Organization.findByPk(id);
      if (!org) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Organization not found' });

      // Permission check: Super Admin or Org Admin for own org
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (parseInt(id) !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Organization Admins can only upload logo for their own organization.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can update organization logos.',
          });
        }
      }

      const { logoUrl } = req.body || {};
      if (!logoUrl) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Logo image data is required.' });
      }

      // Check size limit (base64 size estimation or byte count)
      const approxSizeBytes = Math.round((logoUrl.length * 3) / 4);
      if (approxSizeBytes > MAX_LOGO_SIZE_BYTES) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Payload Too Large',
          message: `Logo file size exceeds the 2.5MB maximum limit. Please upload a smaller image file.`,
        });
      }

      // Automatically replace old logo with new logo
      await org.update({ logoUrl });

      return reply.send({
        statusCode: 200,
        message: 'Organization logo updated successfully.',
        logoUrl: org.logoUrl,
        organization: org
      });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Custom Logo (Revert to default logo)
  fastify.delete('/api/organizations/:id/logo', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
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
              message: 'Organization Admins can only remove logo for their own organization.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can remove organization logos.',
          });
        }
      }

      // Clear custom logo and revert to default
      await org.update({ logoUrl: null });

      return reply.send({
        statusCode: 200,
        message: 'Custom logo removed. Default platform logo restored.',
        logoUrl: null,
        organization: org
      });
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

      if (req.body.logoUrl) {
        const approxSizeBytes = Math.round((req.body.logoUrl.length * 3) / 4);
        if (approxSizeBytes > MAX_LOGO_SIZE_BYTES) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Payload Too Large',
            message: `Logo file size exceeds the 2.5MB maximum limit. Please upload a smaller image file.`,
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


