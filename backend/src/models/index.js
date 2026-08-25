import { Partner } from './Partner.js';
import { Plan } from './Plan.js';
import { Subscription } from './Subscription.js';
import { Organization } from './Organization.js';
import { Project } from './Project.js';
import { Site } from './Site.js';
import { Structure } from './Structure.js';
import { Device } from './Device.js';
import { User } from './User.js';
import { TelemetryRecord } from './TelemetryRecord.js';
import { Alarm } from './Alarm.js';
import { Event } from './Event.js';
import { AlertRule } from './AlertRule.js';
import { NotificationGroup } from './NotificationGroup.js';
import { Incident } from './Incident.js';
import { MaintenanceRecord } from './MaintenanceRecord.js';

// Multi-Tenant Partner & Reseller Hierarchy
Partner.hasMany(Organization, { foreignKey: 'partnerId' });
Organization.belongsTo(Partner, { foreignKey: 'partnerId' });

Partner.hasMany(User, { foreignKey: 'partnerId' });
User.belongsTo(Partner, { foreignKey: 'partnerId' });

// Organization Self-Referencing Hierarchy (Parent Org -> Sub Orgs)
Organization.hasMany(Organization, { as: 'subOrganizations', foreignKey: 'parentOrganizationId' });
Organization.belongsTo(Organization, { as: 'parentOrganization', foreignKey: 'parentOrganizationId' });

// Organization to Site direct connection
Organization.hasMany(Site, { foreignKey: 'organizationId' });
Site.belongsTo(Organization, { foreignKey: 'organizationId' });

// SaaS Subscription & Billing Associations
Organization.hasOne(Subscription, { foreignKey: 'organizationId' });
Subscription.belongsTo(Organization, { foreignKey: 'organizationId' });

Plan.hasMany(Subscription, { foreignKey: 'planId' });
Subscription.belongsTo(Plan, { foreignKey: 'planId' });

// Hierarchical Structure Associations
Organization.hasMany(Project, { foreignKey: 'organizationId' });
Project.belongsTo(Organization, { foreignKey: 'organizationId' });

Organization.hasMany(Structure, { foreignKey: 'organizationId' });
Structure.belongsTo(Organization, { foreignKey: 'organizationId' });

Project.hasMany(Structure, { foreignKey: 'projectId' });
Structure.belongsTo(Project, { foreignKey: 'projectId' });

Project.hasMany(Site, { foreignKey: 'projectId' });
Site.belongsTo(Project, { foreignKey: 'projectId' });

Site.hasMany(Structure, { foreignKey: 'siteId' });
Structure.belongsTo(Site, { foreignKey: 'siteId' });

Structure.hasMany(Device, { foreignKey: 'structureId' });
Device.belongsTo(Structure, { foreignKey: 'structureId' });

Site.hasMany(Device, { foreignKey: 'siteId' });
Device.belongsTo(Site, { foreignKey: 'siteId' });

Project.hasMany(Device, { foreignKey: 'projectId' });
Device.belongsTo(Project, { foreignKey: 'projectId' });

Organization.hasMany(Device, { foreignKey: 'organizationId' });
Device.belongsTo(Organization, { foreignKey: 'organizationId' });

// Device Telemetry, Alarms, Incidents, & Maintenance
Device.hasMany(TelemetryRecord, { foreignKey: 'deviceId' });
TelemetryRecord.belongsTo(Device, { foreignKey: 'deviceId' });

Device.hasMany(Alarm, { foreignKey: 'deviceId' });
Alarm.belongsTo(Device, { foreignKey: 'deviceId' });

Device.hasMany(Event, { foreignKey: 'deviceId' });
Event.belongsTo(Device, { foreignKey: 'deviceId' });

Device.hasMany(Incident, { foreignKey: 'deviceId' });
Incident.belongsTo(Device, { foreignKey: 'deviceId' });

Device.hasMany(MaintenanceRecord, { foreignKey: 'deviceId' });
MaintenanceRecord.belongsTo(Device, { foreignKey: 'deviceId' });

// Alert Rules & Notification Groups
Organization.hasMany(AlertRule, { foreignKey: 'organizationId' });
AlertRule.belongsTo(Organization, { foreignKey: 'organizationId' });

Organization.hasMany(NotificationGroup, { foreignKey: 'organizationId' });
NotificationGroup.belongsTo(Organization, { foreignKey: 'organizationId' });

// User RBAC Associations
Organization.hasMany(User, { foreignKey: 'organizationId' });
User.belongsTo(Organization, { foreignKey: 'organizationId' });

Project.hasMany(User, { foreignKey: 'projectId' });
User.belongsTo(Project, { foreignKey: 'projectId' });

Site.hasMany(User, { foreignKey: 'siteId' });
User.belongsTo(Site, { foreignKey: 'siteId' });

export {
  Partner,
  Plan,
  Subscription,
  Organization,
  Project,
  Site,
  Structure,
  Device,
  User,
  TelemetryRecord,
  Alarm,
  Event,
  AlertRule,
  NotificationGroup,
  Incident,
  MaintenanceRecord,
};
