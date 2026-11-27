import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Project, Site, Organization, Structure, Device } from '../../models/index.js';
import { sequelize } from '../../config/sequelize.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

const __filename_proj = fileURLToPath(import.meta.url);
const __dirname_proj = path.dirname(__filename_proj);
const projectImagesDir = path.join(__dirname_proj, '..', '..', '..', 'uploads', 'project_image');

function deleteOldProjectImageFile(oldImageUrl) {
  if (!oldImageUrl || typeof oldImageUrl !== 'string') return;
  try {
    const normalized = oldImageUrl.replace(/\\/g, '/');
    if (normalized.includes('/uploads/project_image/') || normalized.includes('uploads/project_image/')) {
      let fileName = normalized.split(/uploads\/project_image\//i).pop();
      if (fileName) {
        fileName = path.basename(fileName.split('?')[0].split('#')[0]);
        const filePath = path.join(projectImagesDir, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (err) {
    console.warn('[Delete Project Image File]', err.message);
  }
}

function saveProjectImageToDisk(projectId, base64DataUrl) {
  if (!base64DataUrl || typeof base64DataUrl !== 'string' || !base64DataUrl.startsWith('data:image/')) {
    return base64DataUrl;
  }
  if (!fs.existsSync(projectImagesDir)) {
    fs.mkdirSync(projectImagesDir, { recursive: true });
  }
  const matches = base64DataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+)(?:;[a-zA-Z0-9=-]+)*;base64,([\s\S]+)$/);
  if (!matches || matches.length < 3) return base64DataUrl;

  let ext = matches[1].toLowerCase();
  if (ext.includes('svg')) ext = 'svg';
  else if (ext === 'jpeg' || ext === 'pjpeg') ext = 'jpg';
  else if (ext === 'png') ext = 'png';
  else if (ext === 'webp') ext = 'webp';
  else if (ext === 'gif') ext = 'gif';
  else ext = 'jpg';

  const cleanBase64 = matches[2].replace(/\s/g, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const safeId = String(projectId || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `project_${safeId}_${Date.now()}.${ext}`;
  const filePath = path.join(projectImagesDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/project_image/${filename}`;
}

export async function projectsRoutes(fastify) {
  // Ensure new project columns exist on legacy databases without altering table locks
  sequelize.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "imageUrl" TEXT').catch(() => {});
  sequelize.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "description" TEXT').catch(() => {});
  sequelize.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "budget" VARCHAR(255)').catch(() => {});
  sequelize.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "status" VARCHAR(255) DEFAULT \'ACTIVE\'').catch(() => {});
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

      const { name, organizationId, location, description, budget, status, imageUrl } = req.body;
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

      const savedImageUrl = imageUrl ? saveProjectImageToDisk(nextNumericId, imageUrl) : null;

      const project = await Project.create({
        id: nextNumericId,
        code: String(nextNumericId),
        name: name || `Project ${nextNumericId}`,
        organizationId: targetOrgId,
        location: location || '',
        description: description || '',
        budget: budget || '',
        status: status || 'ACTIVE',
        imageUrl: savedImageUrl,
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

      if (Object.prototype.hasOwnProperty.call(updateData, 'imageUrl')) {
        if (!updateData.imageUrl) {
          deleteOldProjectImageFile(project.imageUrl);
          updateData.imageUrl = null;
        } else if (typeof updateData.imageUrl === 'string' && updateData.imageUrl.startsWith('data:image/')) {
          deleteOldProjectImageFile(project.imageUrl);
          updateData.imageUrl = saveProjectImageToDisk(project.id, updateData.imageUrl);
        }
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

      // Delete project image from disk if present
      deleteOldProjectImageFile(project.imageUrl);

      await project.destroy();
      return reply.send({ statusCode: 200, message: 'Project deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}

