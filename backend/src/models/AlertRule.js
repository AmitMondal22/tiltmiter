import pkg from 'sequelize';
const { DataTypes } = pkg;
import { sequelize } from '../config/sequelize.js';

export const AlertRule = sequelize.define('AlertRule', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  ruleName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  projectId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  projectName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  siteId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  siteName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  assetId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  assetName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deviceIds: {
    type: DataTypes.JSON, // Array of device IDs e.g. ["DEV-001", "DEV-002"]
    defaultValue: [],
  },
  emails: {
    type: DataTypes.JSON, // Array of email addresses e.g. ["system@techavo.in"]
    defaultValue: [],
  },
  parameter: {
    type: DataTypes.STRING, // 'tilt', 'displacement', 'vibration', 'temperature'
    defaultValue: 'tilt',
  },
  condition: {
    type: DataTypes.STRING, // 'GREATER_THAN', 'LESS_THAN', '>'
    defaultValue: 'GREATER_THAN',
  },
  operator: {
    type: DataTypes.STRING, // '>', '<', '>='
    defaultValue: '>',
  },
  thresholdValue: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 2.0,
  },
  severity: {
    type: DataTypes.STRING, // 'INFO', 'WARNING', 'CRITICAL', 'EMERGENCY'
    defaultValue: 'CRITICAL',
  },
  message: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'alert_rules',
  timestamps: true,
});

