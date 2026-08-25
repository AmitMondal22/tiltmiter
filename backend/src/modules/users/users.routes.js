import bcrypt from 'bcryptjs';
import { User, Organization, Project, Site } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function usersRoutes(fastify) {
  // Query all users
  fastify.get('/api/users', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const users = await User.findAll({
        attributes: { exclude: ['passwordHash'] },
        include: [Organization, Project, Site],
        order: [['createdAt', 'DESC']],
      });
      return reply.send({ statusCode: 200, users: users || [] });
    } catch (err) {
      return reply.send({ statusCode: 200, users: [] });
    }
  });

  // Create new User
  fastify.post('/api/users', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { username, email, password, fullName, role, organizationId, projectId, siteId, scopeType, allowedSiteIds } = req.body;
      const user = await User.create({
        username,
        email,
        passwordHash: bcrypt.hashSync(password || 'password123', 10),
        fullName,
        role: role || 'SITE_USER',
        organizationId,
        projectId,
        siteId,
        scopeType: scopeType || 'ALL',
        allowedSiteIds: allowedSiteIds || [],
        status: 'ACTIVE',
      });
      return reply.status(201).send({ statusCode: 201, user });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update User
  fastify.put('/api/users/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const { fullName, email, role, status, scopeType, allowedSiteIds, password } = req.body;
      const user = await User.findByPk(id);
      if (!user) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });

      const updates = { fullName, email, role, status, scopeType, allowedSiteIds };
      if (password) updates.passwordHash = bcrypt.hashSync(password, 10);

      await user.update(updates);
      return reply.send({ statusCode: 200, message: 'User updated successfully', user });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete User
  fastify.delete('/api/users/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id);
      if (!user) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
      await user.destroy();
      return reply.send({ statusCode: 200, message: 'User deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}
