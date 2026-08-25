// Joi Schema Validation Middleware for Fastify
export function validate(schema, source = 'body') {
  return async (req, reply) => {
    try {
      const dataToValidate = req[source];
      const { error, value } = schema.validate(dataToValidate, { abortEarly: false, stripUnknown: true });
      if (error) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid request payload',
          details: error.details.map(d => ({ field: d.path.join('.'), message: d.message }))
        });
      }
      req[source] = value;
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  };
}
