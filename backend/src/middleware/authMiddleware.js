// JWT Verification and Hierarchical Role-Based Access Control (RBAC)
export function authenticate(fastify) {
  return async (req, reply) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Missing or invalid authentication token' });
      }
      const token = authHeader.split(' ')[1];
      const decoded = fastify.jwt.verify(token);
      req.user = decoded;
    } catch (err) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired JWT token' });
    }
  };
}

export function authorize(...roles) {
  return async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    }

    // SUPER_ADMIN has global access across all operations
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      return;
    }

    if (!roles.includes(req.user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Role '${req.user?.role || 'UNKNOWN'}' is not authorized to perform this action. Allowed: ${roles.join(', ')}`
      });
    }
  };
}
