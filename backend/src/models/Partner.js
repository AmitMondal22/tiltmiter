import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Partner = sequelize.define('Partner', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  contactEmail: {
    type: DataTypes.STRING,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'ACTIVE',
  },
  revenueShare: {
    type: DataTypes.FLOAT,
    defaultValue: 15.0,
  },
}, {
  tableName: 'partners',
  timestamps: true,
});
