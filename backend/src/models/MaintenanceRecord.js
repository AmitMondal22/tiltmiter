import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const MaintenanceRecord = sequelize.define('MaintenanceRecord', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING, // CALIBRATION, BATTERY_REPLACEMENT, SENSOR_REPLACEMENT, FIRMWARE_UPDATE, ROUTINE_INSPECTION
    allowNull: false,
  },
  technicianName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  notes: {
    type: DataTypes.TEXT,
  },
  performedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  nextDueDate: {
    type: DataTypes.DATE,
  },
  certificateUrl: {
    type: DataTypes.STRING,
  },
}, {
  tableName: 'maintenance_records',
  timestamps: true,
});
