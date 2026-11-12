import pkg from 'sequelize';
const { DataTypes } = pkg;
import { sequelize } from '../config/sequelize.js';

export const Incident = sequelize.define('Incident', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  incidentCode: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  siteId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  structureId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  alarmId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING, // CRITICAL_ALERT, STRUCTURAL_ANOMALY, SENSOR_FAULT, MAINTENANCE, SITE_INSPECTION, BATTERY_POWER, PHYSICAL_DAMAGE, MANUAL
    defaultValue: 'MANUAL',
  },
  severity: {
    type: DataTypes.STRING, // CRITICAL, HIGH, MEDIUM, LOW
    defaultValue: 'HIGH',
  },
  status: {
    type: DataTypes.STRING, // OPEN, IN_PROGRESS, RESOLVED, CLOSED, REOPENED
    defaultValue: 'OPEN',
  },
  source: {
    type: DataTypes.STRING, // AUTO_ALERT, MANUAL
    defaultValue: 'MANUAL',
  },
  assignedUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  assignedUserName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  assignedUserEmail: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  createdByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  createdByUserName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  acknowledgedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  reopenedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  rootCause: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  correctiveAction: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  siteRemarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  adminRemarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  resolutionImages: {
    type: DataTypes.JSON, // Array of strings (image URLs)
    defaultValue: [],
  },
  notes: {
    type: DataTypes.JSON, // Array of { id, timestamp, author, role, action, text, images }
    defaultValue: [],
  },
}, {
  tableName: 'incidents',
  timestamps: true,
});
