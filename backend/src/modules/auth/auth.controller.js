import { loginUser, registerUser, findUserById } from './auth.service.js';

export async function loginHandler(req, reply) {
  try {
    const { username, password } = req.body;
    const user = await loginUser(username, password);

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      organizationId: user.organizationId,
      projectId: user.projectId,
      siteId: user.siteId,
      partnerId: user.partnerId,
      scopeType: user.scopeType,
      allowedSiteIds: user.allowedSiteIds,
      allowedDeviceIds: user.allowedDeviceIds,
    };
    const accessToken = this.jwt.sign(tokenPayload, { expiresIn: '7d' });
    const refreshToken = this.jwt.sign({ id: user.id, type: 'refresh' }, { expiresIn: '30d' });

    return reply.send({
      statusCode: 200,
      message: 'Login successful',
      token: accessToken,
      accessToken,
      refreshToken,
      user
    });
  } catch (err) {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: err.message });
  }
}

export async function registerHandler(req, reply) {
  try {
    const user = await registerUser(req.body);
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      organizationId: user.organizationId,
      projectId: user.projectId,
      siteId: user.siteId,
      partnerId: user.partnerId,
      scopeType: user.scopeType,
      allowedSiteIds: user.allowedSiteIds,
      allowedDeviceIds: user.allowedDeviceIds,
    };
    const accessToken = this.jwt.sign(tokenPayload, { expiresIn: '7d' });
    const refreshToken = this.jwt.sign({ id: user.id, type: 'refresh' }, { expiresIn: '30d' });

    return reply.status(201).send({
      statusCode: 201,
      message: 'User registered successfully',
      token: accessToken,
      accessToken,
      refreshToken,
      user
    });
  } catch (err) {
    return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
  }
}

export async function refreshTokenHandler(req, reply) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Refresh token is required' });
    }

    const decoded = this.jwt.verify(refreshToken);
    if (decoded.type !== 'refresh') {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid refresh token type' });
    }

    const user = await findUserById(decoded.id);
    if (!user) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'User no longer exists' });
    }

    const tokenPayload = { id: user.id, username: user.username, role: user.role, fullName: user.fullName };
    const newAccessToken = this.jwt.sign(tokenPayload, { expiresIn: '15m' });
    const newRefreshToken = this.jwt.sign({ id: user.id, type: 'refresh' }, { expiresIn: '7d' });

    return reply.send({
      statusCode: 200,
      message: 'Token refreshed successfully',
      token: newAccessToken,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user
    });
  } catch (err) {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired refresh token' });
  }
}

export async function getProfileHandler(req, reply) {
  return reply.send({ statusCode: 200, user: req.user });
}
