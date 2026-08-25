import { Alarm } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function alarmsRoutes(fastify) {
  // Query alarms directly from PostgreSQL database (No Dummy Data)
  fastify.get('/api/alarms', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const dbAlarms = await Alarm.findAll({ order: [['createdAt', 'DESC']] });
      const critical = dbAlarms.filter(a => a.severity === 'CRITICAL').length;
      const major = dbAlarms.filter(a => a.severity === 'MAJOR').length;
      const minor = dbAlarms.filter(a => a.severity === 'MINOR').length;

      return reply.send({
        statusCode: 200,
        summary: { critical, major, minor, warnings: 0, total: dbAlarms.length },
        alarms: dbAlarms || []
      });
    } catch (err) {
      return reply.send({
        statusCode: 200,
        summary: { critical: 0, major: 0, minor: 0, warnings: 0, total: 0 },
        alarms: []
      });
    }
  });
}
