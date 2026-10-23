import pkg from 'sequelize';
const { DataTypes } = pkg;
import { sequelize } from '../config/sequelize.js';

export const Alarm = sequelize.define('Alarm', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => `ALM-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  siteId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  parameter: {
    type: DataTypes.STRING, // 'tilt', 'displacement', 'vibration', 'temperature'
    defaultValue: 'tilt',
  },
  type: {
    type: DataTypes.STRING, // 'TILT', 'DISPLACEMENT', 'ENVIRONMENTAL'
    defaultValue: 'TILT',
  },
  severity: {
    type: DataTypes.STRING, // 'CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'EMERGENCY'
    defaultValue: 'WARNING',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  value: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  threshold: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING, // 'ACTIVE', 'UNACKNOWLEDGED', 'ACKNOWLEDGED', 'RESOLVED'
    defaultValue: 'ACTIVE',
  },
}, {
  timestamps: true,
  tableName: 'alarms',
});

