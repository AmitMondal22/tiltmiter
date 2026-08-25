import Joi from 'joi';

export const loginSchema = Joi.object({
  username: Joi.string().required().messages({ 'any.required': 'Username is required' }),
  password: Joi.string().min(4).required().messages({ 'any.required': 'Password is required' }),
});

export const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  fullName: Joi.string().required(),
  role: Joi.string().valid('SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_ADMIN', 'SITE_USER', 'ADMIN', 'OPERATOR', 'VIEWER', 'TECHNICIAN').default('SITE_USER'),
});
