import { loginHandler, registerHandler, refreshTokenHandler, getProfileHandler } from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function authRoutes(fastify) {
  fastify.post('/api/auth/login', { preHandler: [validate(loginSchema)] }, loginHandler);
  fastify.post('/api/auth/register', { preHandler: [validate(registerSchema)] }, registerHandler);
  fastify.post('/api/auth/refresh', refreshTokenHandler);
  fastify.get('/api/auth/profile', { preHandler: [authenticate(fastify)] }, getProfileHandler);
}
