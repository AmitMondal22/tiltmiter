import { Project, Site, Organization, Structure, Device } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function projectsRoutes(fastify) {
  // Query all projects from PostgreSQL
  fastify.get('/api/projects', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const projects = await Project.findAll({
        include: [
          Organization,
          {
            model: Site,
            include: [Structure, Device]
          }
        ],
        order: [['createdAt', 'DESC']],
      });
      return reply.send({ statusCode: 200, projects: projects || [] });
    } catch (err) {
      return reply.send({ statusCode: 200, projects: [] });
    }
  });

  // Create new project
  fastify.post('/api/projects', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { name, code, organizationId, location } = req.body;
      const project = await Project.create({
        name,
        code: code || `PROJ-${Date.now().toString().slice(-4)}`,
        organizationId: organizationId || 1,
        location: location || ''
      });
      return reply.status(201).send({ statusCode: 201, project });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update project
  fastify.put('/api/projects/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const project = await Project.findByPk(id);
      if (!project) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Project not found' });
      await project.update(req.body);
      return reply.send({ statusCode: 200, message: 'Project updated successfully', project });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete project
  fastify.delete('/api/projects/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const project = await Project.findByPk(id);
      if (!project) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Project not found' });
      await project.destroy();
      return reply.send({ statusCode: 200, message: 'Project deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}
