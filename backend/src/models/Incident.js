import { DataTypes } from 'sequelize';
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
    allowNull: false,
  },
  siteId: {
    type: DataTypes.STRING,
  },
  organizationId: {
    type: DataTypes.INTEGER,
  },
  alarmId: {
    type: DataTypes.INTEGER,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  severity: {
    type: DataTypes.STRING, // INFO, WARNING, CRITICAL, EMERGENCY
    defaultValue: 'CRITICAL',
  },
  status: {
    type: DataTypes.STRING, // NEW, ACKNOWLEDGED, INVESTIGATING, RESOLVED, CLOSED
    defaultValue: 'NEW',
  },
  assignedUserId: {
    type: DataTypes.INTEGER,
  },
  assignedUserName: {
    type: DataTypes.STRING,
  },
  acknowledgedAt: {
    type: DataTypes.DATE,
  },
  resolvedAt: {
    type: DataTypes.DATE,
  },
  rootCause: {
    type: DataTypes.TEXT,
  },
  correctiveAction: {
    type: DataTypes.TEXT,
  },
  notes: {
    type: DataTypes.JSON, // Array of { timestamp, author, text }
    defaultValue: [],
  },
}, {
  tableName: 'incidents',
  timestamps: true,
});
