import { Alarm, AlertRule, Device, Site, Project, Structure } from '../../models/index.js';
import { authenticate, authenticateOptional } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';
import { triggerManualAlert } from '../../services/alertEngineService.js';
import { getActiveRecipientEmails } from '../../services/emailService.js';

// In-memory alarm and alert-rule store for persistence across DB fallback modes
export const memoryAlarms = [];
export let memoryAlertRules = [];
export function getMemoryAlertRules() {
  return memoryAlertRules;
}
let nextRuleId = 1;

export async function alarmsRoutes(fastify) {
  // ─────────────────────────────────────────────────────────────
  // 1. ALERT RULES CRUD API
  // ─────────────────────────────────────────────────────────────

  // 1.1 Get All Alert Rules
  fastify.get('/api/alert-rules', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      let rules = [];
      try {
        rules = await AlertRule.findAll({ order: [['createdAt', 'DESC']] });
        if (rules && rules.length > 0) {
          rules = rules.map(r => (r.toJSON ? r.toJSON() : r));
        }
      } catch (dbErr) {
        // Fallback
      }

      if (!rules || rules.length === 0) {
        rules = [...memoryAlertRules];
      }

      return reply.send({
        statusCode: 200,
        rules,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.send({
        statusCode: 200,
        rules: memoryAlertRules,
      });
    }
  });

  // 1.2 Create New Alert Rule
  fastify.post('/api/alert-rules', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const {
        ruleName,
        projectId,
        projectName,
        siteId,
        siteName,
        assetId,
        assetName,
        deviceIds,
        emails,
        parameter = 'tilt',
        operator = '>',
        thresholdValue = 2.0,
        criticalThreshold = 2.0,
        warningThreshold = 1.0,
        infoThreshold = 0.5,
        severity = 'CRITICAL',
        message = '',
        enabled = true,
      } = req.body || {};

      if (!ruleName) {
        return reply.status(400).send({ statusCode: 400, message: 'Alert rule name is required.' });
      }

      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return reply.status(400).send({ statusCode: 400, message: 'Please select at least one device for this alert rule.' });
      }

      const cleanEmails = (Array.isArray(emails) ? emails : [])
        .filter(e => typeof e === 'string' && !e.toLowerCase().includes('tiltmeter.io'));

      if (cleanEmails.length === 0) {
        return reply.status(400).send({ statusCode: 400, message: 'Please specify at least one valid recipient email address.' });
      }

      const critVal = parseFloat(criticalThreshold ?? thresholdValue) || (parameter === 'tilt' ? 2.0 : 10.0);
      const warnVal = parseFloat(warningThreshold) || (parameter === 'tilt' ? 1.0 : 5.0);
      const infoVal = parseFloat(infoThreshold) || (parameter === 'tilt' ? 0.5 : 2.0);

      const ruleData = {
        ruleName,
        projectId: projectId || null,
        projectName: projectName || null,
        siteId: siteId || null,
        siteName: siteName || null,
        assetId: assetId || null,
        assetName: assetName || null,
        deviceIds,
        emails: cleanEmails,
        parameter,
        operator,
        thresholdValue: critVal,
        criticalThreshold: critVal,
        warningThreshold: warnVal,
        infoThreshold: infoVal,
        severity,
        message: message || `${parameter.toUpperCase()} limit breach rule on assigned devices`,
        enabled: Boolean(enabled),
      };

      let createdRule = null;
      try {
        const dbRule = await AlertRule.create(ruleData);
        createdRule = dbRule.toJSON ? dbRule.toJSON() : dbRule;
      } catch (dbErr) {
        // Fallback
        createdRule = {
          id: nextRuleId++,
          ...ruleData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      // Add to memory list
      memoryAlertRules.unshift(createdRule);

      return reply.send({
        statusCode: 201,
        success: true,
        message: `Alert rule "${ruleName}" created successfully.`,
        rule: createdRule,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to create alert rule',
        message: err.message,
      });
    }
  });

  // 1.3 Update (Edit) Alert Rule
  fastify.put('/api/alert-rules/:id', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const {
        ruleName,
        projectId,
        projectName,
        siteId,
        siteName,
        assetId,
        assetName,
        deviceIds,
        emails,
        parameter,
        operator,
        thresholdValue,
        criticalThreshold,
        warningThreshold,
        infoThreshold,
        severity,
        message,
        enabled,
      } = req.body || {};

      const updates = {};
      if (ruleName !== undefined) updates.ruleName = ruleName;
      if (projectId !== undefined) updates.projectId = projectId;
      if (projectName !== undefined) updates.projectName = projectName;
      if (siteId !== undefined) updates.siteId = siteId;
      if (siteName !== undefined) updates.siteName = siteName;
      if (assetId !== undefined) updates.assetId = assetId;
      if (assetName !== undefined) updates.assetName = assetName;
      if (Array.isArray(deviceIds)) updates.deviceIds = deviceIds;
      if (Array.isArray(emails)) {
        updates.emails = emails.filter(e => typeof e === 'string' && !e.toLowerCase().includes('tiltmeter.io'));
      }
      if (parameter !== undefined) updates.parameter = parameter;
      if (operator !== undefined) updates.operator = operator;
      if (criticalThreshold !== undefined) {
        updates.criticalThreshold = parseFloat(criticalThreshold);
        updates.thresholdValue = parseFloat(criticalThreshold);
      } else if (thresholdValue !== undefined) {
        updates.thresholdValue = parseFloat(thresholdValue);
        updates.criticalThreshold = parseFloat(thresholdValue);
      }
      if (warningThreshold !== undefined) updates.warningThreshold = parseFloat(warningThreshold);
      if (infoThreshold !== undefined) updates.infoThreshold = parseFloat(infoThreshold);
      if (severity !== undefined) updates.severity = severity;
      if (message !== undefined) updates.message = message;
      if (enabled !== undefined) updates.enabled = Boolean(enabled);

      let updatedRule = null;
      try {
        const dbRule = await AlertRule.findByPk(id);
        if (dbRule) {
          await dbRule.update(updates);
          updatedRule = dbRule.toJSON ? dbRule.toJSON() : dbRule;
        }
      } catch (dbErr) {
        // Fallback
      }

      // Update memory store
      const idx = memoryAlertRules.findIndex(r => String(r.id) === String(id));
      if (idx !== -1) {
        memoryAlertRules[idx] = {
          ...memoryAlertRules[idx],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        if (!updatedRule) updatedRule = memoryAlertRules[idx];
      }

      if (!updatedRule) {
        return reply.status(404).send({ statusCode: 404, message: 'Alert rule not found.' });
      }

      return reply.send({
        statusCode: 200,
        success: true,
        message: `Alert rule "${updatedRule.ruleName}" updated successfully.`,
        rule: updatedRule,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to update alert rule',
        message: err.message,
      });
    }
  });

  // 1.4 Delete Alert Rule
  fastify.delete('/api/alert-rules/:id', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const numId = parseInt(id, 10);

      try {
        if (!isNaN(numId)) {
          await AlertRule.destroy({ where: { id: numId } });
        } else {
          await AlertRule.destroy({ where: { id } });
        }
      } catch (dbErr) {
        fastify.log.warn(`[AlertRules] DB destroy notice: ${dbErr.message}`);
      }

      memoryAlertRules = memoryAlertRules.filter(r => String(r.id) !== String(id) && (!isNaN(numId) ? Number(r.id) !== numId : true));

      return reply.send({
        statusCode: 200,
        success: true,
        message: 'Alert rule deleted successfully.',
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to delete alert rule',
        message: err.message,
      });
    }
  });

  // 1.5 Trigger Alert Rule On Demand (Generate Alert & Send Email)
  fastify.post('/api/alert-rules/:id/trigger', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const { id } = req.params;
      let targetRule = null;

      try {
        const dbRule = await AlertRule.findByPk(id);
        if (dbRule) targetRule = dbRule.toJSON ? dbRule.toJSON() : dbRule;
      } catch (e) {}

      if (!targetRule) {
        targetRule = memoryAlertRules.find(r => String(r.id) === String(id));
      }

      if (!targetRule) {
        return reply.status(404).send({ statusCode: 404, message: 'Alert rule not found.' });
      }

      const activeRecipients = (Array.isArray(targetRule.emails) && targetRule.emails.length > 0
        ? targetRule.emails
        : await getActiveRecipientEmails()).filter(e => typeof e === 'string' && !e.toLowerCase().includes('tiltmeter.io'));

      const requestedSeverity = (req.body?.severity || targetRule.severity || 'CRITICAL').toUpperCase();
      let thresholdToUse = targetRule.criticalThreshold || targetRule.thresholdValue || 2.0;
      if (requestedSeverity === 'WARNING') {
        thresholdToUse = targetRule.warningThreshold || (targetRule.parameter === 'tilt' ? 1.0 : 5.0);
      } else if (requestedSeverity === 'INFO') {
        thresholdToUse = targetRule.infoThreshold || (targetRule.parameter === 'tilt' ? 0.5 : 2.0);
      }

      const alertResult = await triggerManualAlert({
        deviceIds: targetRule.deviceIds || ['DEV-001'],
        parameter: targetRule.parameter || 'tilt',
        severity: requestedSeverity,
        tiltValue: targetRule.parameter === 'tilt' ? thresholdToUse : 0,
        displacementValue: targetRule.parameter === 'displacement' ? thresholdToUse : 0,
        customMessage: targetRule.message || `Breach detected for rule: ${targetRule.ruleName} (${requestedSeverity})`,
        recipients: activeRecipients,
      });

      // Add to alarms
      for (const d of alertResult.dispatches || []) {
        memoryAlarms.unshift({
          id: d.alarmId,
          deviceId: d.deviceId,
          parameter: d.parameter,
          type: d.parameter.toUpperCase(),
          severity: d.severity,
          message: targetRule.message || `Alert rule triggered: ${targetRule.ruleName} on device ${d.deviceId}`,
          value: targetRule.parameter === 'tilt' ? `${targetRule.thresholdValue}°` : `${targetRule.thresholdValue} mm`,
          threshold: `${targetRule.thresholdValue}`,
          createdAt: new Date().toISOString(),
          status: 'ACTIVE',
        });
      }

      return reply.send({
        statusCode: 200,
        success: true,
        message: `Alert triggered for rule "${targetRule.ruleName}" on ${targetRule.deviceIds?.length || 1} device(s) and notification email sent to ${activeRecipients.join(', ')}.`,
        data: alertResult,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to trigger alert rule',
        message: err.message,
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 2. HIERARCHY METADATA (PROJECTS -> SITES -> ASSETS -> DEVICES)
  // ─────────────────────────────────────────────────────────────
  fastify.get('/api/alert-rules/hierarchy', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      let dbProjects = [];
      let dbSites = [];
      let dbStructures = [];
      let realDevices = [];

      try {
        const pList = await Project.findAll({ order: [['name', 'ASC']] });
        dbProjects = pList.map(p => {
          const item = p.toJSON ? p.toJSON() : p;
          return { id: String(item.id), name: item.name || `Project ${item.id}`, code: item.code || String(item.id) };
        });
      } catch (e) {
        dbProjects = [];
      }

      try {
        const sList = await Site.findAll({ order: [['name', 'ASC']] });
        dbSites = sList.map(s => {
          const item = s.toJSON ? s.toJSON() : s;
          return {
            id: String(item.id),
            projectId: item.projectId ? String(item.projectId) : null,
            name: item.name || `Site ${item.id}`,
            code: item.code || String(item.id),
          };
        });
      } catch (e) {
        dbSites = [];
      }

      try {
        const structList = await Structure.findAll({ order: [['name', 'ASC']] });
        dbStructures = structList.map(st => {
          const item = st.toJSON ? st.toJSON() : st;
          return {
            id: String(item.id),
            siteId: item.siteId ? String(item.siteId) : null,
            projectId: item.projectId ? String(item.projectId) : null,
            name: item.name || `Asset ${item.id}`,
            type: item.type || item.structureType || 'Structure',
          };
        });
      } catch (e) {
        dbStructures = [];
      }

      try {
        const dbDevices = await Device.findAll({ order: [['id', 'ASC']] });
        if (dbDevices && dbDevices.length > 0) {
          realDevices = dbDevices.map(d => {
            const dev = d.toJSON ? d.toJSON() : d;
            return {
              id: dev.id,
              name: dev.name || dev.id,
              projectId: dev.projectId ? String(dev.projectId) : null,
              siteId: dev.siteId ? String(dev.siteId) : null,
              assetId: dev.structureId ? String(dev.structureId) : null,
              type: dev.structureType || dev.communicationType || 'TILTMETER',
              status: dev.status || 'ONLINE',
              resultantTilt: parseFloat(dev.resultantTilt || 0),
              totalDisplacement: parseFloat(dev.totalDisplacement || 0),
            };
          });
        }
      } catch (dbErr) {
        fastify.log.warn('Could not fetch devices from DB for hierarchy:', dbErr.message);
      }

      return reply.send({
        statusCode: 200,
        projects: dbProjects,
        locations: dbSites,
        assets: dbStructures,
        devices: realDevices,
        usingRealDevices: true,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to retrieve hierarchy metadata',
        message: err.message,
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 3. ALARMS FEED & MANUAL ALERT DISPATCH API
  // ─────────────────────────────────────────────────────────────

  // 3.1 Query Alarms List & Severity Summary (supports ?deviceId= filtering)
  fastify.get('/api/alarms', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const { deviceId } = req.query || {};
      let dbAlarms = [];
      try {
        const where = {};
        if (deviceId) {
          const cleanDevId = String(deviceId).trim();
          where[Op.or] = [
            { deviceId: cleanDevId },
            { deviceId: cleanDevId.toUpperCase() },
            { deviceId: cleanDevId.toLowerCase() },
          ];
        }
        dbAlarms = await Alarm.findAll({ where, order: [['createdAt', 'DESC']] });
      } catch (dbErr) {
        let mem = [...memoryAlarms];
        if (deviceId) {
          const lowerId = String(deviceId).trim().toLowerCase();
          mem = mem.filter(a => (a.deviceId || '').toLowerCase() === lowerId);
        }
        dbAlarms = mem.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      const alarmMap = new Map();
      const targetDevLower = deviceId ? String(deviceId).trim().toLowerCase() : null;
      for (const a of memoryAlarms) {
        if (targetDevLower && (a.deviceId || '').toLowerCase() !== targetDevLower) continue;
        alarmMap.set(a.id, a);
      }
      for (const a of dbAlarms) {
        const item = a.toJSON ? a.toJSON() : a;
        if (targetDevLower && (item.deviceId || '').toLowerCase() !== targetDevLower) continue;
        alarmMap.set(item.id, item);
      }

      const allAlarms = Array.from(alarmMap.values()).sort(
        (a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp)
      );

      const critical = allAlarms.filter(a => a.severity === 'CRITICAL' || a.severity === 'EMERGENCY').length;
      const major = allAlarms.filter(a => a.severity === 'MAJOR').length;
      const minor = allAlarms.filter(a => a.severity === 'MINOR' || a.severity === 'WARNING').length;

      return reply.send({
        statusCode: 200,
        summary: {
          critical,
          major,
          minor,
          warnings: minor,
          total: allAlarms.length,
        },
        alarms: allAlarms,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.send({
        statusCode: 200,
        summary: { critical: 0, major: 0, minor: 0, warnings: 0, total: 0 },
        alarms: [],
      });
    }
  });

  // 3.2 Fetch Devices List for Multi-Device Selection (Real DB devices scoped by login user)
  fastify.get('/api/alarms/devices', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      let realDevices = [];
      try {
        const where = {};
        if (req.user && req.user.role !== 'SUPER_ADMIN') {
          if (req.user.organizationId) {
            where.organizationId = req.user.organizationId;
          }
          if (req.user.projectId) {
            where.projectId = req.user.projectId;
          }
          if (req.user.siteId) {
            where.siteId = req.user.siteId;
          }
          if (req.user.scopeType === 'SELECTED_DEVICES' && Array.isArray(req.user.allowedDeviceIds) && req.user.allowedDeviceIds.length > 0) {
            where.id = req.user.allowedDeviceIds;
          } else if (req.user.scopeType === 'SELECTED_SITES' && Array.isArray(req.user.allowedSiteIds) && req.user.allowedSiteIds.length > 0) {
            where.siteId = req.user.allowedSiteIds;
          }
        }
        const dbDevices = await Device.findAll({
          where,
          include: [
            {
              model: Site,
              include: [Project]
            }
          ],
          order: [['id', 'ASC']]
        });
        if (dbDevices && dbDevices.length > 0) {
          realDevices = dbDevices.map(d => {
            const dev = d.toJSON ? d.toJSON() : d;
            return {
              id: dev.id,
              name: dev.name || dev.id,
              type: dev.structureType || dev.communicationType || 'TILTMETER',
              status: dev.status || 'ONLINE',
              siteId: dev.siteId || null,
              siteName: dev.Site?.name || dev.siteId || null,
              projectId: dev.projectId || dev.Site?.projectId || null,
              organizationId: dev.organizationId || null,
              resultantTilt: parseFloat(dev.resultantTilt || 0),
              totalDisplacement: parseFloat(dev.totalDisplacement || 0),
            };
          });
        }
      } catch (dbErr) {
        fastify.log.warn('Could not fetch devices from DB for alarms:', dbErr.message);
      }

      return reply.send({
        statusCode: 200,
        devices: realDevices,
        usingRealDevices: true,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to retrieve devices',
        message: err.message,
      });
    }
  });

  // 3.3 Generate Alert & Send Email
  fastify.post('/api/alarms/generate', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const {
        deviceIds,
        parameter = 'tilt',
        severity = 'CRITICAL',
        tiltValue = 2.45,
        displacementValue = 12.8,
        customMessage = null,
        recipients = null,
      } = req.body || {};

      if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Please select at least one device to generate alerts for.',
        });
      }

      const activeRecipients = Array.isArray(recipients) && recipients.length > 0
        ? recipients
        : await getActiveRecipientEmails();

      if (activeRecipients.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No email recipients configured. Please specify or add recipient emails.',
        });
      }

      const alertResult = await triggerManualAlert({
        deviceIds,
        parameter,
        severity,
        tiltValue,
        displacementValue,
        customMessage,
        recipients: activeRecipients,
      });

      for (const d of alertResult.dispatches || []) {
        memoryAlarms.unshift({
          id: d.alarmId,
          deviceId: d.deviceId,
          parameter: d.parameter,
          type: d.parameter.toUpperCase(),
          severity: d.severity,
          message: customMessage || `Operator triggered ${d.parameter.toUpperCase()} alert on device ${d.deviceId}`,
          value: d.parameter === 'tilt' ? `${tiltValue}°` : `${displacementValue} mm`,
          threshold: d.severity === 'CRITICAL' ? (d.parameter === 'tilt' ? '2.000°' : '10.00 mm') : (d.parameter === 'tilt' ? '1.000°' : '5.00 mm'),
          createdAt: new Date().toISOString(),
          status: 'ACTIVE',
        });
      }

      if (memoryAlarms.length > 100) {
        memoryAlarms.length = 100;
      }

      return reply.send({
        statusCode: 200,
        success: true,
        message: `Alert generated for ${deviceIds.length} device(s) and notification email dispatched to ${activeRecipients.length} recipient(s).`,
        data: alertResult,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Alert Generation Error',
        message: err.message,
      });
    }
  });

  // 3.4 Clear Alarms Feed
  fastify.delete('/api/alarms/clear', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      memoryAlarms.length = 0;
      try {
        await Alarm.destroy({ where: {} });
      } catch (e) {}

      return reply.send({
        statusCode: 200,
        success: true,
        message: 'Alarms feed cleared successfully.',
      });
    } catch (err) {
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to clear alarms',
        message: err.message,
      });
    }
  });
}
