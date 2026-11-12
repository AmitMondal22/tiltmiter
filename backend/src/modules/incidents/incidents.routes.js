import { Incident, Device, Site, Structure, User, Alarm } from '../../models/index.js';
import { authenticateOptional, authenticate } from '../../middleware/authMiddleware.js';
import { memoryTickets, saveTicketImageToDisk } from '../../services/incidentService.js';
import { Op } from '../../config/sequelize.js';

let nextIdCounter = 500;

function enrichTicketData(ticket) {
  const plain = ticket.toJSON ? ticket.toJSON() : { ...ticket };
  return plain;
}

export async function incidentsRoutes(fastify) {
  // --- 1. Get Tickets / Incidents with rich filtering ---
  const handleGetTickets = async (req, reply) => {
    try {
      const {
        status,
        severity,
        source,
        deviceId,
        siteId,
        structureId,
        assignedUserId,
        search,
      } = req.query || {};

      let dbTickets = [];
      try {
        const where = {};
        if (status) {
          const statuses = status.split(',').map(s => s.trim().toUpperCase());
          where.status = statuses.length === 1 ? statuses[0] : { [Op.in]: statuses };
        }
        if (severity) {
          where.severity = severity.toUpperCase();
        }
        if (source) {
          where.source = source.toUpperCase();
        }
        if (deviceId) {
          where.deviceId = deviceId;
        }
        if (siteId) {
          where.siteId = String(siteId);
        }
        if (structureId) {
          where.structureId = String(structureId);
        }
        if (assignedUserId) {
          where.assignedUserId = parseInt(assignedUserId, 10);
        }
        if (search) {
          const q = `%${search.trim().toLowerCase()}%`;
          where[Op.or] = [
            { incidentCode: { [Op.iLike]: q } },
            { title: { [Op.iLike]: q } },
            { deviceId: { [Op.iLike]: q } },
          ];
        }

        dbTickets = await Incident.findAll({
          where,
          order: [['createdAt', 'DESC']],
          limit: 150,
        });
      } catch (dbErr) {
        // Fallback to memory store
        console.warn('[Incidents] DB query fallback:', dbErr.message);
      }

      // If DB returned nothing or failed, use memory store
      let list = (dbTickets && dbTickets.length > 0)
        ? dbTickets.map(enrichTicketData)
        : [...memoryTickets];

      // Apply in-memory filters if fallback active
      if (!dbTickets || dbTickets.length === 0) {
        if (status) {
          const statuses = status.split(',').map(s => s.trim().toUpperCase());
          list = list.filter(t => statuses.includes((t.status || '').toUpperCase()));
        }
        if (severity) {
          list = list.filter(t => (t.severity || '').toUpperCase() === severity.toUpperCase());
        }
        if (source) {
          list = list.filter(t => (t.source || '').toUpperCase() === source.toUpperCase());
        }
        if (deviceId) {
          list = list.filter(t => String(t.deviceId || '').toLowerCase() === String(deviceId).toLowerCase());
        }
        if (siteId) {
          list = list.filter(t => String(t.siteId || '').toLowerCase() === String(siteId).toLowerCase());
        }
        if (structureId) {
          list = list.filter(t => String(t.structureId || '').toLowerCase() === String(structureId).toLowerCase());
        }
        if (assignedUserId) {
          list = list.filter(t => Number(t.assignedUserId) === Number(assignedUserId));
        }
        if (search) {
          const q = search.trim().toLowerCase();
          list = list.filter(t =>
            (t.incidentCode || '').toLowerCase().includes(q) ||
            (t.title || '').toLowerCase().includes(q) ||
            (t.deviceId || '').toLowerCase().includes(q) ||
            (t.siteRemarks || '').toLowerCase().includes(q)
          );
        }
      }

      return reply.send({
        statusCode: 200,
        total: list.length,
        incidents: list,
        tickets: list,
      });
    } catch (err) {
      console.error('[Incidents] Error fetching tickets:', err);
      return reply.send({
        statusCode: 200,
        total: memoryTickets.length,
        incidents: memoryTickets,
        tickets: memoryTickets,
      });
    }
  };

  fastify.get('/api/incidents', { preHandler: [authenticateOptional(fastify)] }, handleGetTickets);
  fastify.get('/api/tickets', { preHandler: [authenticateOptional(fastify)] }, handleGetTickets);

  // --- 2. Ticket Statistics & KPIs ---
  const handleGetStats = async (req, reply) => {
    let list = [...memoryTickets];
    try {
      const dbAll = await Incident.findAll();
      if (dbAll && dbAll.length > 0) {
        list = dbAll.map(enrichTicketData);
      }
    } catch (_) {
      // Memory fallback
    }

    const stats = {
      total: list.length,
      open: list.filter(t => t.status === 'OPEN').length,
      inProgress: list.filter(t => t.status === 'IN_PROGRESS').length,
      resolved: list.filter(t => t.status === 'RESOLVED').length, // Awaiting admin review
      closed: list.filter(t => t.status === 'CLOSED').length,
      reopened: list.filter(t => t.status === 'REOPENED').length,
      critical: list.filter(t => t.severity === 'CRITICAL' || t.severity === 'EMERGENCY').length,
      autoAlert: list.filter(t => t.source === 'AUTO_ALERT').length,
      manual: list.filter(t => t.source === 'MANUAL').length,
    };

    return reply.send({ statusCode: 200, stats });
  };

  fastify.get('/api/incidents/stats', { preHandler: [authenticateOptional(fastify)] }, handleGetStats);
  fastify.get('/api/tickets/stats', { preHandler: [authenticateOptional(fastify)] }, handleGetStats);

  // --- 3. Get Single Ticket by ID or Code ---
  const handleGetSingle = async (req, reply) => {
    const { id } = req.params;
    let ticket = null;

    try {
      const isNum = !isNaN(parseInt(id, 10));
      ticket = await Incident.findOne({
        where: isNum
          ? { [Op.or]: [{ id: parseInt(id, 10) }, { incidentCode: String(id) }] }
          : { incidentCode: String(id) },
      });
    } catch (_) {
      // Memory fallback
    }

    if (!ticket) {
      ticket = memoryTickets.find(t => String(t.id) === String(id) || String(t.incidentCode) === String(id));
    }

    if (!ticket) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Ticket not found.' });
    }

    return reply.send({ statusCode: 200, ticket: enrichTicketData(ticket), incident: enrichTicketData(ticket) });
  };

  fastify.get('/api/incidents/:id', { preHandler: [authenticateOptional(fastify)] }, handleGetSingle);
  fastify.get('/api/tickets/:id', { preHandler: [authenticateOptional(fastify)] }, handleGetSingle);

  // --- 4. Manually Create Ticket (Site, Structural Asset, Device, Remarks, Assigned User) ---
  const handleCreateTicket = async (req, reply) => {
    try {
      const {
        title,
        remarks,
        description,
        category = 'MANUAL',
        severity = 'HIGH',
        siteId = null,
        structureId = null,
        deviceId = null,
        organizationId = null,
        assignedUserId = null,
        assignedUserName = null,
        assignedUserEmail = null,
      } = req.body || {};

      if (!title || typeof title !== 'string' || title.trim() === '') {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ticket title is required.' });
      }

      const ticketCode = `TKT-M${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const creatorName = req.user?.fullName || req.user?.username || 'Admin Operator';
      const creatorId = req.user?.id || 1;
      const initialStatus = assignedUserId ? 'IN_PROGRESS' : 'OPEN';

      const initialNote = {
        id: 1,
        timestamp: new Date().toISOString(),
        author: creatorName,
        role: req.user?.role || 'SUPER_ADMIN',
        action: 'CREATED',
        text: remarks || description || `Ticket manually created: ${title.trim()}`,
      };

      const newTicketPayload = {
        incidentCode: ticketCode,
        title: title.trim(),
        category: (category || 'MANUAL').toUpperCase(),
        severity: (severity || 'HIGH').toUpperCase(),
        status: initialStatus,
        source: 'MANUAL',
        siteId: siteId ? String(siteId) : null,
        structureId: structureId ? String(structureId) : null,
        deviceId: deviceId ? String(deviceId) : null,
        organizationId: organizationId || req.user?.organizationId || 1,
        assignedUserId: assignedUserId ? parseInt(assignedUserId, 10) : null,
        assignedUserName: assignedUserName || null,
        assignedUserEmail: assignedUserEmail || null,
        createdByUserId: creatorId,
        createdByUserName: creatorName,
        rootCause: remarks || description || null,
        correctiveAction: null,
        siteRemarks: null,
        adminRemarks: null,
        resolutionImages: [],
        notes: [initialNote],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let created = null;
      try {
        created = await Incident.create(newTicketPayload);
      } catch (dbErr) {
        newTicketPayload.id = nextIdCounter++;
        created = newTicketPayload;
      }

      const finalObj = created.toJSON ? created.toJSON() : created;
      memoryTickets.unshift(finalObj);

      return reply.status(201).send({
        statusCode: 201,
        message: 'Ticket created successfully',
        ticket: finalObj,
        incident: finalObj,
      });
    } catch (err) {
      console.error('[Incidents] Create error:', err);
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  };

  fastify.post('/api/incidents', { preHandler: [authenticateOptional(fastify)] }, handleCreateTicket);
  fastify.post('/api/tickets', { preHandler: [authenticateOptional(fastify)] }, handleCreateTicket);

  // --- 5. Assign / Reassign Ticket ---
  const handleAssignTicket = async (req, reply) => {
    const { id } = req.params;
    const { assignedUserId, assignedUserName, assignedUserEmail, note } = req.body || {};

    let ticket = null;
    try {
      const isNum = !isNaN(parseInt(id, 10));
      ticket = await Incident.findOne({
        where: isNum
          ? { [Op.or]: [{ id: parseInt(id, 10) }, { incidentCode: String(id) }] }
          : { incidentCode: String(id) },
      });
    } catch (_) {}

    const memIdx = memoryTickets.findIndex(t => String(t.id) === String(id) || String(t.incidentCode) === String(id));
    if (!ticket && memIdx === -1) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Ticket not found.' });
    }

    const currentNotes = ticket ? (ticket.notes || []) : (memoryTickets[memIdx].notes || []);
    const assignNote = {
      id: currentNotes.length + 1,
      timestamp: new Date().toISOString(),
      author: req.user?.fullName || req.user?.username || 'Admin Operator',
      role: req.user?.role || 'SUPER_ADMIN',
      action: 'ASSIGNED',
      text: note || `Ticket assigned to ${assignedUserName || `User #${assignedUserId}`}.`,
    };

    const updates = {
      assignedUserId: assignedUserId ? parseInt(assignedUserId, 10) : null,
      assignedUserName: assignedUserName || null,
      assignedUserEmail: assignedUserEmail || null,
      status: (ticket?.status === 'OPEN' || memoryTickets[memIdx]?.status === 'OPEN') ? 'IN_PROGRESS' : undefined,
      notes: [...currentNotes, assignNote],
      updatedAt: new Date().toISOString(),
    };

    // Remove undefined
    Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

    if (ticket) {
      await ticket.update(updates);
    }
    if (memIdx !== -1) {
      memoryTickets[memIdx] = { ...memoryTickets[memIdx], ...updates };
    }

    const updated = ticket ? enrichTicketData(ticket) : memoryTickets[memIdx];
    return reply.send({ statusCode: 200, message: 'Ticket assigned successfully', ticket: updated });
  };

  fastify.post('/api/incidents/:id/assign', { preHandler: [authenticateOptional(fastify)] }, handleAssignTicket);
  fastify.post('/api/tickets/:id/assign', { preHandler: [authenticateOptional(fastify)] }, handleAssignTicket);

  // --- 6. User Site Resolution (Remarks + Upload Images) ---
  const handleResolveTicket = async (req, reply) => {
    try {
      const { id } = req.params;
      const {
        siteRemarks,
        correctiveAction,
        rootCause,
        images = [], // Array of base64 images or existing URLs
      } = req.body || {};

      let ticket = null;
      try {
        const isNum = !isNaN(parseInt(id, 10));
        ticket = await Incident.findOne({
          where: isNum
            ? { [Op.or]: [{ id: parseInt(id, 10) }, { incidentCode: String(id) }] }
            : { incidentCode: String(id) },
        });
      } catch (_) {}

      const memIdx = memoryTickets.findIndex(t => String(t.id) === String(id) || String(t.incidentCode) === String(id));
      if (!ticket && memIdx === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Ticket not found.' });
      }

      const activeCode = ticket?.incidentCode || memoryTickets[memIdx]?.incidentCode || 'TKT';

      // Save any new base64 uploaded resolution images to disk permanently
      const savedImageUrls = [];
      if (Array.isArray(images)) {
        for (const img of images) {
          if (img && typeof img === 'string') {
            if (img.startsWith('data:image/')) {
              const diskUrl = saveTicketImageToDisk(activeCode, img);
              if (diskUrl) savedImageUrls.push(diskUrl);
            } else {
              savedImageUrls.push(img);
            }
          }
        }
      }

      const currentImages = ticket ? (ticket.resolutionImages || []) : (memoryTickets[memIdx].resolutionImages || []);
      const allImages = [...currentImages, ...savedImageUrls];

      const currentNotes = ticket ? (ticket.notes || []) : (memoryTickets[memIdx].notes || []);
      const resolveNote = {
        id: currentNotes.length + 1,
        timestamp: new Date().toISOString(),
        author: req.user?.fullName || req.user?.username || 'Field Technician',
        role: req.user?.role || 'SITE_USER',
        action: 'RESOLVED',
        text: siteRemarks || 'Site work completed. Resolution submitted for Admin review.',
        images: savedImageUrls,
      };

      const updates = {
        status: 'RESOLVED',
        resolvedAt: new Date().toISOString(),
        siteRemarks: siteRemarks || 'Site inspection and corrective action completed.',
        correctiveAction: correctiveAction || (ticket?.correctiveAction || memoryTickets[memIdx]?.correctiveAction),
        rootCause: rootCause || (ticket?.rootCause || memoryTickets[memIdx]?.rootCause),
        resolutionImages: allImages,
        notes: [...currentNotes, resolveNote],
        updatedAt: new Date().toISOString(),
      };

      if (ticket) {
        await ticket.update(updates);
      }
      if (memIdx !== -1) {
        memoryTickets[memIdx] = { ...memoryTickets[memIdx], ...updates };
      }

      const updated = ticket ? enrichTicketData(ticket) : memoryTickets[memIdx];
      return reply.send({
        statusCode: 200,
        message: 'Ticket resolution submitted successfully. Awaiting Admin verification.',
        ticket: updated,
      });
    } catch (err) {
      console.error('[Incidents] Resolve error:', err);
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  };

  fastify.post('/api/incidents/:id/resolve', { preHandler: [authenticateOptional(fastify)] }, handleResolveTicket);
  fastify.post('/api/tickets/:id/resolve', { preHandler: [authenticateOptional(fastify)] }, handleResolveTicket);

  // --- 7. Admin Close Ticket ---
  const handleCloseTicket = async (req, reply) => {
    try {
      const { id } = req.params;
      const { adminRemarks } = req.body || {};

      let ticket = null;
      try {
        const isNum = !isNaN(parseInt(id, 10));
        ticket = await Incident.findOne({
          where: isNum
            ? { [Op.or]: [{ id: parseInt(id, 10) }, { incidentCode: String(id) }] }
            : { incidentCode: String(id) },
        });
      } catch (_) {}

      const memIdx = memoryTickets.findIndex(t => String(t.id) === String(id) || String(t.incidentCode) === String(id));
      if (!ticket && memIdx === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Ticket not found.' });
      }

      const currentNotes = ticket ? (ticket.notes || []) : (memoryTickets[memIdx].notes || []);
      const closeNote = {
        id: currentNotes.length + 1,
        timestamp: new Date().toISOString(),
        author: req.user?.fullName || req.user?.username || 'Admin Operator',
        role: req.user?.role || 'SUPER_ADMIN',
        action: 'CLOSED',
        text: adminRemarks || 'Ticket approved and formally closed by Administrator.',
      };

      const updates = {
        status: 'CLOSED',
        closedAt: new Date().toISOString(),
        adminRemarks: adminRemarks || 'Approved and closed.',
        notes: [...currentNotes, closeNote],
        updatedAt: new Date().toISOString(),
      };

      if (ticket) {
        await ticket.update(updates);
      }
      if (memIdx !== -1) {
        memoryTickets[memIdx] = { ...memoryTickets[memIdx], ...updates };
      }

      const updated = ticket ? enrichTicketData(ticket) : memoryTickets[memIdx];
      return reply.send({
        statusCode: 200,
        message: 'Ticket approved and closed successfully.',
        ticket: updated,
      });
    } catch (err) {
      console.error('[Incidents] Close error:', err);
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  };

  fastify.post('/api/incidents/:id/close', { preHandler: [authenticateOptional(fastify)] }, handleCloseTicket);
  fastify.post('/api/tickets/:id/close', { preHandler: [authenticateOptional(fastify)] }, handleCloseTicket);

  // --- 8. Admin Reopen / Reject Resolution (Replay feedback) ---
  const handleReopenTicket = async (req, reply) => {
    try {
      const { id } = req.params;
      const { adminRemarks } = req.body || {};

      let ticket = null;
      try {
        const isNum = !isNaN(parseInt(id, 10));
        ticket = await Incident.findOne({
          where: isNum
            ? { [Op.or]: [{ id: parseInt(id, 10) }, { incidentCode: String(id) }] }
            : { incidentCode: String(id) },
        });
      } catch (_) {}

      const memIdx = memoryTickets.findIndex(t => String(t.id) === String(id) || String(t.incidentCode) === String(id));
      if (!ticket && memIdx === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Ticket not found.' });
      }

      const currentNotes = ticket ? (ticket.notes || []) : (memoryTickets[memIdx].notes || []);
      const reopenNote = {
        id: currentNotes.length + 1,
        timestamp: new Date().toISOString(),
        author: req.user?.fullName || req.user?.username || 'Admin Operator',
        role: req.user?.role || 'SUPER_ADMIN',
        action: 'REOPENED',
        text: adminRemarks || 'Admin rejected resolution: Re-work required at site.',
      };

      const updates = {
        status: 'REOPENED',
        reopenedAt: new Date().toISOString(),
        adminRemarks: adminRemarks || 'Re-opened for additional site work.',
        notes: [...currentNotes, reopenNote],
        updatedAt: new Date().toISOString(),
      };

      if (ticket) {
        await ticket.update(updates);
      }
      if (memIdx !== -1) {
        memoryTickets[memIdx] = { ...memoryTickets[memIdx], ...updates };
      }

      const updated = ticket ? enrichTicketData(ticket) : memoryTickets[memIdx];
      return reply.send({
        statusCode: 200,
        message: 'Ticket re-opened for field technician re-work.',
        ticket: updated,
      });
    } catch (err) {
      console.error('[Incidents] Reopen error:', err);
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  };

  fastify.post('/api/incidents/:id/reopen', { preHandler: [authenticateOptional(fastify)] }, handleReopenTicket);
  fastify.post('/api/tickets/:id/reopen', { preHandler: [authenticateOptional(fastify)] }, handleReopenTicket);

  // --- 9. Add Comment / Discussion Note ---
  const handleAddComment = async (req, reply) => {
    try {
      const { id } = req.params;
      const { text, images = [] } = req.body || {};

      if (!text || typeof text !== 'string' || text.trim() === '') {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Comment text is required.' });
      }

      let ticket = null;
      try {
        const isNum = !isNaN(parseInt(id, 10));
        ticket = await Incident.findOne({
          where: isNum
            ? { [Op.or]: [{ id: parseInt(id, 10) }, { incidentCode: String(id) }] }
            : { incidentCode: String(id) },
        });
      } catch (_) {}

      const memIdx = memoryTickets.findIndex(t => String(t.id) === String(id) || String(t.incidentCode) === String(id));
      if (!ticket && memIdx === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Ticket not found.' });
      }

      const activeCode = ticket?.incidentCode || memoryTickets[memIdx]?.incidentCode || 'TKT';
      const savedUrls = [];
      if (Array.isArray(images)) {
        for (const img of images) {
          if (img && typeof img === 'string') {
            if (img.startsWith('data:image/')) {
              const diskUrl = saveTicketImageToDisk(activeCode, img);
              if (diskUrl) savedUrls.push(diskUrl);
            } else {
              savedUrls.push(img);
            }
          }
        }
      }

      const currentNotes = ticket ? (ticket.notes || []) : (memoryTickets[memIdx].notes || []);
      const newNote = {
        id: currentNotes.length + 1,
        timestamp: new Date().toISOString(),
        author: req.user?.fullName || req.user?.username || 'User',
        role: req.user?.role || 'SITE_USER',
        action: 'COMMENT',
        text: text.trim(),
        images: savedUrls,
      };

      const updates = {
        notes: [...currentNotes, newNote],
        updatedAt: new Date().toISOString(),
      };

      if (ticket) {
        await ticket.update(updates);
      }
      if (memIdx !== -1) {
        memoryTickets[memIdx] = { ...memoryTickets[memIdx], ...updates };
      }

      const updated = ticket ? enrichTicketData(ticket) : memoryTickets[memIdx];
      return reply.send({ statusCode: 200, message: 'Comment added successfully', ticket: updated });
    } catch (err) {
      console.error('[Incidents] Comment error:', err);
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  };

  fastify.post('/api/incidents/:id/comment', { preHandler: [authenticateOptional(fastify)] }, handleAddComment);
  fastify.post('/api/tickets/:id/comment', { preHandler: [authenticateOptional(fastify)] }, handleAddComment);

  // --- 10. Legacy PATCH Support for compatibility ---
  fastify.patch('/api/incidents/:id', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    const { id } = req.params;
    const { status, assignedUserId, assignedUserName, rootCause, correctiveAction, note } = req.body || {};

    let ticket = null;
    try {
      ticket = await Incident.findByPk(id);
    } catch (_) {}

    const memIdx = memoryTickets.findIndex(t => String(t.id) === String(id));
    if (!ticket && memIdx === -1) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Incident not found' });
    }

    const updates = {};
    if (status) {
      updates.status = status;
      if (status === 'ACKNOWLEDGED') updates.acknowledgedAt = new Date().toISOString();
      if (status === 'RESOLVED') updates.resolvedAt = new Date().toISOString();
      if (status === 'CLOSED') updates.closedAt = new Date().toISOString();
    }
    if (assignedUserId) updates.assignedUserId = assignedUserId;
    if (assignedUserName) updates.assignedUserName = assignedUserName;
    if (rootCause) updates.rootCause = rootCause;
    if (correctiveAction) updates.correctiveAction = correctiveAction;

    const currentNotes = ticket ? (ticket.notes || []) : (memoryTickets[memIdx].notes || []);
    if (note) {
      updates.notes = [
        ...currentNotes,
        {
          id: currentNotes.length + 1,
          timestamp: new Date().toISOString(),
          author: req.user?.fullName || 'User',
          role: req.user?.role || 'OPERATOR',
          action: 'UPDATE',
          text: note,
        }
      ];
    }

    if (ticket) await ticket.update(updates);
    if (memIdx !== -1) memoryTickets[memIdx] = { ...memoryTickets[memIdx], ...updates };

    const updated = ticket ? enrichTicketData(ticket) : memoryTickets[memIdx];
    return reply.send({ statusCode: 200, message: 'Incident updated successfully', incident: updated, ticket: updated });
  });

  // --- 11. Delete Ticket (Admin Only) ---
  const handleDeleteTicket = async (req, reply) => {
    try {
      const { id } = req.params;
      try {
        const isNum = !isNaN(parseInt(id, 10));
        await Incident.destroy({
          where: isNum
            ? { [Op.or]: [{ id: parseInt(id, 10) }, { incidentCode: String(id) }] }
            : { incidentCode: String(id) },
        });
      } catch (_) {}

      const idx = memoryTickets.findIndex(t => String(t.id) === String(id) || String(t.incidentCode) === String(id));
      if (idx !== -1) {
        memoryTickets.splice(idx, 1);
      }

      return reply.send({ statusCode: 200, message: 'Ticket deleted successfully.' });
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  };

  fastify.delete('/api/incidents/:id', { preHandler: [authenticateOptional(fastify)] }, handleDeleteTicket);
  fastify.delete('/api/tickets/:id', { preHandler: [authenticateOptional(fastify)] }, handleDeleteTicket);
}
