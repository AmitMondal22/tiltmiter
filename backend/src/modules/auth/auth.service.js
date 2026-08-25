import bcrypt from 'bcryptjs';
import { User, Organization, Project, Site } from '../../models/index.js';

export async function loginUser(username, password) {
  const normUser = username.toLowerCase().trim();

  let user;
  try {
    user = await User.findOne({
      where: { username: normUser },
      include: [Organization, Project, Site]
    });
  } catch (err) {
    user = await User.findOne({
      where: { username: normUser },
    });
  }

  if (!user) {
    throw new Error('Invalid username or password');
  }

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!isMatch) {
    throw new Error('Invalid username or password');
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    partnerId: user.partnerId || null,
    organizationId: user.organizationId || 1,
    projectId: user.projectId || 1,
    siteId: user.siteId || 'SITE-KB01',
    scopeType: user.scopeType || 'ALL',
    allowedSiteIds: user.allowedSiteIds || [],
    allowedDeviceIds: user.allowedDeviceIds || [],
    Organization: user.Organization,
    Project: user.Project,
    Site: user.Site,
  };
}

export async function registerUser({ username, email, password, fullName, role, organizationId, projectId, siteId, scopeType, allowedSiteIds }) {
  const normUser = username.toLowerCase().trim();
  const passwordHash = bcrypt.hashSync(password, 10);

  const newUser = await User.create({
    username: normUser,
    email,
    passwordHash,
    fullName,
    role: role || 'SITE_USER',
    organizationId: organizationId || 1,
    projectId: projectId || 1,
    siteId: siteId || 'SITE-KB01',
    scopeType: scopeType || 'ALL',
    allowedSiteIds: allowedSiteIds || [],
  });

  return {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    fullName: newUser.fullName,
    role: newUser.role,
    organizationId: newUser.organizationId,
    projectId: newUser.projectId,
    siteId: newUser.siteId,
    scopeType: newUser.scopeType,
    allowedSiteIds: newUser.allowedSiteIds,
  };
}

export async function findUserById(id) {
  let user;
  try {
    user = await User.findByPk(id, {
      include: [Organization, Project, Site]
    });
  } catch (err) {
    user = await User.findByPk(id);
  }
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    partnerId: user.partnerId || null,
    organizationId: user.organizationId || 1,
    projectId: user.projectId || 1,
    siteId: user.siteId || 'SITE-KB01',
    scopeType: user.scopeType || 'ALL',
    allowedSiteIds: user.allowedSiteIds || [],
    allowedDeviceIds: user.allowedDeviceIds || [],
    Organization: user.Organization,
    Project: user.Project,
    Site: user.Site,
  };
}
