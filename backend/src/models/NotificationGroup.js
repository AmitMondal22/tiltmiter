import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const NotificationGroup = sequelize.define('NotificationGroup', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  siteId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  groupName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  recipients: {
    type: DataTypes.JSON, // Array of email strings / phone numbers
    defaultValue: [],
  },
  channels: {
    type: DataTypes.JSON, // ["EMAIL", "SMS", "WHATSAPP", "WEBHOOK"]
    defaultValue: ["EMAIL"],
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'notification_groups',
  timestamps: true,
});
