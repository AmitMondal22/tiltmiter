import { Subscription, Plan, Organization } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function subscriptionsRoutes(fastify) {
  // Get all SaaS Plans
  fastify.get('/api/subscriptions/plans', async (req, reply) => {
    const plans = await Plan.findAll({ order: [['priceMonthly', 'ASC']] });
    return reply.send({ statusCode: 200, plans });
  });

  // Get Tenant Active Subscription
  fastify.get('/api/subscriptions/current', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    const user = req.user;
    const orgId = user.organizationId || 1;
    const subscription = await Subscription.findOne({
      where: { organizationId: orgId },
      include: [Plan, Organization],
    });
    return reply.send({ statusCode: 200, subscription });
  });

  // Super Admin: List all Subscriptions
  fastify.get('/api/subscriptions', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Super Admin access required' });
    }
    const subscriptions = await Subscription.findAll({ include: [Plan, Organization] });
    return reply.send({ statusCode: 200, subscriptions });
  });
}
