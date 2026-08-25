import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  fullName: {
    type: DataTypes.STRING,
  },
  role: {
    type: DataTypes.STRING, // SUPER_ADMIN, ORG_ADMIN, ORG_USER, SITE_ADMIN, SITE_USER, VIEWER, MAINTENANCE_USER, ANALYST, API_USER
    defaultValue: 'SITE_USER',
  },
  partnerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  projectId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  siteId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  scopeType: {
    type: DataTypes.STRING, // ALL, SELECTED_SITES, SELECTED_DEVICES
    defaultValue: 'ALL',
  },
  allowedSiteIds: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  allowedDeviceIds: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'ACTIVE',
  },
}, {
  tableName: 'users',
  timestamps: true,
});
