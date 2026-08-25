import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Event = sequelize.define('Event', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('info', 'warning', 'alert'),
    defaultValue: 'info',
  },
}, {
  timestamps: true,
  tableName: 'events',
});
