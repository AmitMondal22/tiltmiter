import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Alarm = sequelize.define('Alarm', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  severity: {
    type: DataTypes.ENUM('CRITICAL', 'MAJOR', 'MINOR', 'WARNING'),
    defaultValue: 'WARNING',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('UNACKNOWLEDGED', 'ACKNOWLEDGED', 'RESOLVED'),
    defaultValue: 'UNACKNOWLEDGED',
  },
}, {
  timestamps: true,
  tableName: 'alarms',
});
