import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const AlertRule = sequelize.define('AlertRule', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  siteId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ruleName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  parameter: {
    type: DataTypes.STRING, // tilt, roll, pitch, vibration, displacement, temperature, battery
    allowNull: false,
  },
  condition: {
    type: DataTypes.STRING, // GREATER_THAN, LESS_THAN, RATE_OF_CHANGE, DEV_FROM_BASELINE
    allowNull: false,
  },
  thresholdValue: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  timeWindowMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
  },
  severity: {
    type: DataTypes.STRING, // INFO, WARNING, CRITICAL, EMERGENCY
    defaultValue: 'WARNING',
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'alert_rules',
  timestamps: true,
});
