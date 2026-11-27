import pkg from 'sequelize';
const { DataTypes } = pkg;
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
    type: DataTypes.STRING, // Mountain Slope, Hill Slope, Rock Slope, Landslide Zone, Embankment, Retaining Wall, or any custom terrain slope
    defaultValue: 'Mountain Slope',
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
  polygon: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [], // Array of { lat, lng } polygon boundary points
  },
  polygonColor: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#7c3aed',
  },
}, {
  timestamps: true,
  tableName: 'structures',
});
