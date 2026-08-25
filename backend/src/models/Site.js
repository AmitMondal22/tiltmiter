import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Site = sequelize.define('Site', {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
  },
  address: {
    type: DataTypes.STRING,
  },
  location: {
    type: DataTypes.STRING,
  },
  latitude: {
    type: DataTypes.FLOAT,
    defaultValue: 22.5726,
  },
  longitude: {
    type: DataTypes.FLOAT,
    defaultValue: 88.3639,
  },
  elevation: {
    type: DataTypes.FLOAT,
    defaultValue: 18.6,
  },
}, {
  tableName: 'sites',
  timestamps: true,
});
