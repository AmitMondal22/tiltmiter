import { Incident, Device, User } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function incidentsRoutes(fastify) {
  // Get Incidents
  fastify.get('/api/incidents', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    const incidents = await Incident.findAll({
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    return reply.send({ statusCode: 200, incidents });
  });

  // Acknowledge / Assign / Resolve Incident
  fastify.patch('/api/incidents/:id', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    const { id } = req.params;
    const { status, assignedUserId, assignedUserName, rootCause, correctiveAction, note } = req.body;

    const incident = await Incident.findByPk(id);
    if (!incident) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Incident not found' });
    }

    const updates = {};
    if (status) {
      updates.status = status;
      if (status === 'ACKNOWLEDGED' && !incident.acknowledgedAt) updates.acknowledgedAt = new Date();
      if (status === 'RESOLVED' && !incident.resolvedAt) updates.resolvedAt = new Date();
    }
    if (assignedUserId) updates.assignedUserId = assignedUserId;
    if (assignedUserName) updates.assignedUserName = assignedUserName;
    if (rootCause) updates.rootCause = rootCause;
    if (correctiveAction) updates.correctiveAction = correctiveAction;

    if (note) {
      const existingNotes = incident.notes || [];
      updates.notes = [
        ...existingNotes,
        { timestamp: new Date().toISOString(), author: req.user?.fullName || 'User', text: note }
      ];
    }

    await incident.update(updates);
    return reply.send({ statusCode: 200, message: 'Incident updated successfully', incident });
  });
}
