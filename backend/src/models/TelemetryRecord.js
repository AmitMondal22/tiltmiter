import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const TelemetryRecord = sequelize.define('TelemetryRecord', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  xTilt: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  yTilt: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  resultantTilt: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  xDisplacement: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  yDisplacement: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  zDisplacement: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  totalDisplacement: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  temperature: {
    type: DataTypes.FLOAT,
    defaultValue: 25.0,
  },
  acceleration: {
    type: DataTypes.JSONB,
  },
  gyroscope: {
    type: DataTypes.JSONB,
  },
  vibration: {
    type: DataTypes.JSONB,
  },
  rawPayload: {
    type: DataTypes.JSONB,
  },
}, {
  tableName: 'telemetry_records',
  timestamps: false,
  indexes: [
    {
      fields: ['deviceId', 'timestamp'],
    },
    {
      fields: ['timestamp'],
    },
  ],
});
