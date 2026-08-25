import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Device = sequelize.define('Device', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true, // e.g. TM-001
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
  structureId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  serialNumber: {
    type: DataTypes.STRING,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'ONLINE',
  },
  battery: {
    type: DataTypes.STRING,
    defaultValue: '100%',
  },
  signalStrength: {
    type: DataTypes.STRING,
    defaultValue: '-60 dBm',
  },
  temperature: {
    type: DataTypes.FLOAT,
    defaultValue: 25.0,
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
  totalDisplacement: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  lifecycleStatus: {
    type: DataTypes.STRING, // MANUFACTURED, REGISTERED, AVAILABLE, ASSIGNED, INSTALLED, ACTIVE, MAINTENANCE, RETIRED
    defaultValue: 'ACTIVE',
  },
  imei: {
    type: DataTypes.STRING,
  },
  simNumber: {
    type: DataTypes.STRING,
  },
  firmwareVersion: {
    type: DataTypes.STRING,
    defaultValue: 'v2.4.1',
  },
  hardwareVersion: {
    type: DataTypes.STRING,
    defaultValue: 'HW-v3.0',
  },
  communicationType: {
    type: DataTypes.STRING, // 4G/LTE, NB-IoT, LoRaWAN, RS485, MQTT
    defaultValue: '4G/LTE',
  },
  installationPoint: {
    type: DataTypes.STRING,
  },
  structureType: {
    type: DataTypes.STRING, // Retaining Wall, Bridge Pier, Tunnel, Dam, Building
  },
  floorPierTower: {
    type: DataTypes.STRING, // Pier-03, Floor-04, Span-A
  },
  elevation: {
    type: DataTypes.FLOAT,
    defaultValue: 18.6,
  },
  latitude: {
    type: DataTypes.FLOAT,
    defaultValue: 22.5726,
  },
  longitude: {
    type: DataTypes.FLOAT,
    defaultValue: 88.3639,
  },
  healthScore: {
    type: DataTypes.INTEGER,
    defaultValue: 95,
  },
  dataQualityScore: {
    type: DataTypes.FLOAT,
    defaultValue: 98.7,
  },
  baselineTilt: {
    type: DataTypes.FLOAT,
    defaultValue: 0.15,
  },
  baselineRoll: {
    type: DataTypes.FLOAT,
    defaultValue: 0.05,
  },
  baselinePitch: {
    type: DataTypes.FLOAT,
    defaultValue: 0.02,
  },
  baselineVibration: {
    type: DataTypes.FLOAT,
    defaultValue: 0.01,
  },
  lastSeen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  sleep_count: {
    type: DataTypes.INTEGER,
    defaultValue: 10, // Minutes
  },
  wake_count: {
    type: DataTypes.INTEGER,
    defaultValue: 30, // Seconds
  },
  calibrate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'devices',
  timestamps: true,
});
