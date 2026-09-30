import { Organization, Project, Site } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsLogosDir = path.join(__dirname, '..', '..', '..', 'uploads', 'logos');

// Helper function to safely delete old permanent logo file from disk
function deleteOldLogoFile(oldLogoUrl) {
  if (!oldLogoUrl || typeof oldLogoUrl !== 'string') return;
  try {
    if (oldLogoUrl.includes('/uploads/logos/')) {
      const fileName = oldLogoUrl.split('/uploads/logos/').pop();
      if (fileName) {
        const filePath = path.join(uploadsLogosDir, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (err) {
    console.error('Error deleting old logo file from disk:', err.message);
  }
}

// Helper to save base64 logo permanently to disk
function saveLogoToDisk(orgId, base64DataUrl) {
  if (!base64DataUrl.startsWith('data:image/')) {
    return base64DataUrl; // Already a URL
  }

  if (!fs.existsSync(uploadsLogosDir)) {
    fs.mkdirSync(uploadsLogosDir, { recursive: true });
  }

  // Parse mime type and base64 data
  const matches = base64DataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!matches || matches.length < 3) {
    return base64DataUrl;
  }

  let ext = matches[1].toLowerCase();
  if (ext === 'svg+xml') ext = 'svg';
  if (ext === 'jpeg') ext = 'jpg';

  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `org_${orgId}_${Date.now()}.${ext}`;
  const filePath = path.join(uploadsLogosDir, filename);

  fs.writeFileSync(filePath, buffer);
  return `/uploads/logos/${filename}`;
}

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
      
      let storedLogoUrl = logoUrl || null;
      if (storedLogoUrl && storedLogoUrl.startsWith('data:image/')) {
        storedLogoUrl = saveLogoToDisk(`new_${Date.now()}`, storedLogoUrl);
      }

      const org = await Organization.create({
        name,
        code: code || `ORG-${Date.now().toString().slice(-4)}`,
        description: description || '',
        partnerId: partnerId || null,
        address: address || '',
        contactEmail: contactEmail || '',
        logoUrl: storedLogoUrl,
        status: status || 'ACTIVE',
      });
      return reply.status(201).send({ statusCode: 201, organization: org });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Upload or update Custom Logo for Organization (Permanent Disk File Storage)
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

      // 1. Delete previous permanent disk file if one exists
      deleteOldLogoFile(org.logoUrl);

      // 2. Save new logo permanently to backend/uploads/logos/
      const permanentLogoUrl = saveLogoToDisk(org.id, logoUrl);

      // 3. Update database record with permanent URL
      await org.update({ logoUrl: permanentLogoUrl });

      return reply.send({
        statusCode: 200,
        message: 'Organization logo saved permanently.',
        logoUrl: permanentLogoUrl,
        organization: org
      });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Delete Custom Logo (Permanent Disk File Deletion & Revert to default logo)
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

      // Delete permanent disk file
      deleteOldLogoFile(org.logoUrl);

      // Clear custom logo in database
      await org.update({ logoUrl: null });

      return reply.send({
        statusCode: 200,
        message: 'Custom logo permanently removed. Default platform logo restored.',
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


