import bcrypt from 'bcryptjs';
import { User, Organization, Project, Site } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

export async function usersRoutes(fastify) {
  // Query users scoped by organization / role
  fastify.get('/api/users', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user.role === 'ORG_ADMIN') {
        where.organizationId = req.user.organizationId;
      } else if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.organizationId = req.user.organizationId;
        }
      }

      const users = await User.findAll({
        where,
        attributes: { exclude: ['passwordHash'] },
        include: [Organization, Project, Site],
        order: [['createdAt', 'DESC']],
      });
      return reply.send({ statusCode: 200, users: users || [] });
    } catch (err) {
      return reply.send({ statusCode: 200, users: [] });
    }
  });

  // Create new User inside organization
  fastify.post('/api/users', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const requester = req.user;
      if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ORG_ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Administrators can create new user accounts.',
        });
      }

      const { username, email, password, fullName, role, organizationId, projectId, siteId, scopeType, allowedSiteIds } = req.body;

      if (!username) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Username is required' });
      }

      // Check for duplicate username
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: `Username '${username}' is already taken.` });
      }

      // Role & Organization boundary enforcement
      let targetRole = role || 'SITE_USER';
      let targetOrgId = organizationId;

      if (requester.role === 'ORG_ADMIN') {
        if (targetRole === 'SUPER_ADMIN') {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Organization Administrators cannot create Super Administrator accounts.',
          });
        }
        // Force user to belong to the Org Admin's organization
        targetOrgId = requester.organizationId;
      }

      const user = await User.create({
        username,
        email: email || '',
        passwordHash: bcrypt.hashSync(password || 'password123', 10),
        fullName: fullName || username,
        role: targetRole,
        organizationId: targetOrgId || null,
        projectId: projectId || null,
        siteId: siteId || null,
        scopeType: scopeType || 'ALL',
        allowedSiteIds: allowedSiteIds || [],
        status: 'ACTIVE',
      });

      const userWithAssoc = await User.findByPk(user.id, {
        attributes: { exclude: ['passwordHash'] },
        include: [Organization, Project, Site],
      });

      return reply.status(201).send({ statusCode: 201, user: userWithAssoc || user });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update User
  fastify.put('/api/users/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const requester = req.user;
      const { id } = req.params;
      const { fullName, email, role, status, scopeType, allowedSiteIds, password, organizationId, projectId, siteId } = req.body;

      const user = await User.findByPk(id);
      if (!user) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });

      // Permission checks
      if (requester.role !== 'SUPER_ADMIN') {
        if (requester.role === 'ORG_ADMIN') {
          // Can only update users within own organization
          if (user.organizationId !== requester.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot modify users outside your organization.',
            });
          }
          // Cannot modify a SUPER_ADMIN
          if (user.role === 'SUPER_ADMIN') {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Organization Administrators cannot edit Super Administrator accounts.',
            });
          }
          // Cannot promote anyone to SUPER_ADMIN
          if (role === 'SUPER_ADMIN') {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Organization Administrators cannot assign the Super Administrator role.',
            });
          }
        } else if (requester.id !== user.id) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You can only update your own user profile.',
          });
        }
      }

      const updates = {};
      if (fullName !== undefined) updates.fullName = fullName;
      if (email !== undefined) updates.email = email;
      if (status !== undefined) updates.status = status;
      if (scopeType !== undefined) updates.scopeType = scopeType;
      if (allowedSiteIds !== undefined) updates.allowedSiteIds = allowedSiteIds;
      if (projectId !== undefined) updates.projectId = projectId;
      if (siteId !== undefined) updates.siteId = siteId;

      if (requester.role === 'SUPER_ADMIN') {
        if (role !== undefined) updates.role = role;
        if (organizationId !== undefined) updates.organizationId = organizationId;
      } else if (requester.role === 'ORG_ADMIN') {
        if (role !== undefined && role !== 'SUPER_ADMIN') updates.role = role;
      }

      if (password) {
        updates.passwordHash = bcrypt.hashSync(password, 10);
      }

      await user.update(updates);

      const updatedUser = await User.findByPk(id, {
        attributes: { exclude: ['passwordHash'] },
        include: [Organization, Project, Site],
      });

      return reply.send({ statusCode: 200, message: 'User updated successfully', user: updatedUser || user });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete User
  fastify.delete('/api/users/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const requester = req.user;
      const { id } = req.params;

      const user = await User.findByPk(id);
      if (!user) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });

      // Super Admins cannot be deleted
      if (user.role === 'SUPER_ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Root Super Administrator accounts cannot be deleted.',
        });
      }

      // Self-deletion guard
      if (requester.id === user.id) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'You cannot delete your own logged-in user account.',
        });
      }

      if (requester.role !== 'SUPER_ADMIN') {
        if (requester.role === 'ORG_ADMIN') {
          if (user.organizationId !== requester.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot delete users outside your organization.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can delete user accounts.',
          });
        }
      }

      await user.destroy();
      return reply.send({ statusCode: 200, message: 'User deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}

