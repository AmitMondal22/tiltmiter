import pkg from 'sequelize';
const { DataTypes } = pkg;
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
  schemaVersion: {
    type: DataTypes.INTEGER,
    defaultValue: 2,
  },
  sampleUptimeMs: {
    type: DataTypes.BIGINT,
    defaultValue: null,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },

  // Direct Flat/Extracted Sensor Readings (without alteration)
  xTilt: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  yTilt: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  zTilt: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  yaw: {
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
    defaultValue: null,
  },
  batteryVoltage: {
    type: DataTypes.FLOAT,
    defaultValue: null,
  },
  csq: {
    type: DataTypes.INTEGER,
    defaultValue: null,
  },
  rockfallDeltaPeak: {
    type: DataTypes.FLOAT,
    defaultValue: null,
  },
  touchVibrationPeak: {
    type: DataTypes.FLOAT,
    defaultValue: null,
  },
  vibrationRMS: {
    type: DataTypes.FLOAT,
    defaultValue: null,
  },
  motionClassification: {
    type: DataTypes.STRING,
    defaultValue: null,
  },
  alarmActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  eventPending: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  // Destructured Object Groups (Schema v2)
  acceleration: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  accelerationCurrent: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  accelerationReference: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  accelerationDelta: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  gyroscope: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  tilt: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  angleReference: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  angleCurrent: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  angleDelta: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  vibration: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  displacement: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  environment: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  power: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  network: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  calibration: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  rockfallAlarm: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  motionEvent: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  monitoringSettings: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },
  units: {
    type: DataTypes.JSONB,
    defaultValue: null,
  },

  // Exact Raw Incoming JSON Payload (Intact & Unaltered)
  rawPayload: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
}, {
  tableName: 'telemetry_records',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['deviceId', 'timestamp'],
    },
    {
      fields: ['timestamp'],
    },
    {
      fields: ['deviceId'],
    },
  ],
});
