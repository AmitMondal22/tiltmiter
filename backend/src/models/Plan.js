import pkg from 'sequelize';
const { DataTypes } = pkg;
import { sequelize } from '../config/sequelize.js';

export const Plan = sequelize.define('Plan', {
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
  deviceLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 25,
  },
  siteLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 2,
  },
  userLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
  },
  retentionMonths: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
  },
  apiAccess: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  priceMonthly: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
}, {
  tableName: 'plans',
  timestamps: true,
});
