import { Project, Site, Organization, Structure, Device } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

export async function projectsRoutes(fastify) {
  // Query projects scoped by organization
  fastify.get('/api/projects', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.organizationId = req.user.organizationId;
        } else {
          return reply.send({ statusCode: 200, projects: [] });
        }
      }

      const projects = await Project.findAll({
        where,
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

  // Create new project (Backend automatically generates numeric Project ID)
  fastify.post('/api/projects', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ORG_ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Administrators can create new projects.',
        });
      }

      const { name, organizationId, location, description, budget, status } = req.body;
      const targetOrgId = req.user.role === 'ORG_ADMIN' ? req.user.organizationId : (organizationId || req.user.organizationId || 1);

      // Backend generates sequential numeric Project ID (e.g. 1001, 1002, ...)
      let nextNumericId = 1001;
      try {
        const allProjects = await Project.findAll({ attributes: ['id'] });
        let maxNum = 1000;
        for (const p of allProjects) {
          const parsed = parseInt(p.id, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
        nextNumericId = maxNum + 1;
      } catch (err) {
        nextNumericId = parseInt(String(Date.now()).slice(-6), 10);
      }

      const project = await Project.create({
        id: nextNumericId,
        code: String(nextNumericId),
        name: name || `Project ${nextNumericId}`,
        organizationId: targetOrgId,
        location: location || '',
        description: description || '',
        budget: budget || '',
        status: status || 'ACTIVE',
      });

      const loadedProject = await Project.findByPk(project.id, {
        include: [Organization, { model: Site, include: [Structure, Device] }]
      });

      return reply.status(201).send({ statusCode: 201, project: loadedProject || project });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update project (Backend handles update via ID parameter)
  fastify.put('/api/projects/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const project = await Project.findByPk(id);
      if (!project) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Project not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (project.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot modify projects belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can modify projects.',
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

      await project.update(updateData);
      const loaded = await Project.findByPk(id, {
        include: [Organization, { model: Site, include: [Structure, Device] }]
      });

      return reply.send({ statusCode: 200, message: 'Project updated successfully', project: loaded || project });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete project (Backend handles deletion and nullifies associations)
  fastify.delete('/api/projects/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const project = await Project.findByPk(id);
      if (!project) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Project not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (project.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot delete projects belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can delete projects.',
          });
        }
      }

      // Detach related sites, structures, and devices cleanly
      await Site.update({ projectId: null }, { where: { projectId: id } }).catch(() => {});
      await Structure.update({ projectId: null }, { where: { projectId: id } }).catch(() => {});
      await Device.update({ projectId: null }, { where: { projectId: id } }).catch(() => {});

      await project.destroy();
      return reply.send({ statusCode: 200, message: 'Project deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}

