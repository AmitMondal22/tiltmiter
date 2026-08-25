import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Organization = sequelize.define('Organization', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  parentOrganizationId: {
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
    unique: true,
  },
  description: {
    type: DataTypes.STRING,
  },
  address: {
    type: DataTypes.STRING,
  },
  contactEmail: {
    type: DataTypes.STRING,
  },
  type: {
    type: DataTypes.STRING, // PARENT_ORG, SUB_ORG, RESELLER_ORG
    defaultValue: 'PARENT_ORG',
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'ACTIVE',
  },
}, {
  tableName: 'organizations',
  timestamps: true,
});
