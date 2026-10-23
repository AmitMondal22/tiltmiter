import pkg from 'sequelize';
const { DataTypes } = pkg;
import { sequelize } from '../config/sequelize.js';

export const Project = sequelize.define('Project', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  location: {
    type: DataTypes.STRING,
  },
}, {
  tableName: 'projects',
  timestamps: true,
});
