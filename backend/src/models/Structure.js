import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Structure = sequelize.define('Structure', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
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
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
  },
  type: {
    type: DataTypes.STRING, // Crash Barrier, Sound Barrier, Retaining Wall, Slope Barrier, Bridge Pier, Tunnel Shaft, Dam Abutment
    defaultValue: 'Crash Barrier',
  },
  latitude: {
    type: DataTypes.FLOAT,
    defaultValue: 22.5726,
  },
  longitude: {
    type: DataTypes.FLOAT,
    defaultValue: 88.3639,
  },
  heightElevation: {
    type: DataTypes.FLOAT,
    defaultValue: 15.0,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'structures',
});
