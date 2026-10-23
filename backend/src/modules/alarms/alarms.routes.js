import { Alarm, AlertRule, Device, Site, Project, Structure } from '../../models/index.js';
import { authenticate, authenticateOptional } from '../../middleware/authMiddleware.js';
import { triggerManualAlert } from '../../services/alertEngineService.js';
import { getActiveRecipientEmails } from '../../services/emailService.js';

// In-memory alarm and alert-rule store for persistence across DB fallback modes
const memoryAlarms = [];
let memoryAlertRules = [
  {
    id: 1,
    ruleName: 'Critical Tilt Limit - Cut Slope Beta',
    projectId: 'PROJ-01',
    projectName: 'Metro Line Expansion Corridor',
    siteId: 'SITE-01',
    siteName: 'Cut Slope Beta',
    assetId: 'ASSET-01',
    assetName: 'Retaining Wall Alpha',
    deviceIds: ['DEV-001', 'DEV-002'],
    emails: ['system@techavo.in'],
    parameter: 'tilt',
    operator: '>',
    thresholdValue: 2.000,
    severity: 'CRITICAL',
    message: 'Resultant tilt exceeded critical threshold 2.000° on slope retaining structure.',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    ruleName: 'Subsurface Displacement Warning - Shaft 04',
    projectId: 'PROJ-01',
    projectName: 'Metro Line Expansion Corridor',
    siteId: 'SITE-02',
    siteName: 'Metro Deep Shaft 04',
    assetId: 'ASSET-02',
    assetName: 'Tunnel Shaft Grouting Ring',
    deviceIds: ['DEV-002'],
    emails: ['system@techavo.in'],
    parameter: 'displacement',
    operator: '>',
    thresholdValue: 10.00,
    severity: 'CRITICAL',
    message: 'Lateral displacement exceeded critical limit 10.00 mm.',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    ruleName: 'Viaduct Pier Tilt Warning',
    projectId: 'PROJ-02',
    projectName: 'High-Speed Rail Viaduct Package 4',
    siteId: 'SITE-03',
    siteName: 'Bridge Viaduct Pier 12',
    assetId: 'ASSET-03',
    assetName: 'Bridge Pier BP-12',
    deviceIds: ['DEV-003'],
    emails: ['system@techavo.in'],
    parameter: 'tilt',
    operator: '>',
    thresholdValue: 1.000,
    severity: 'WARNING',
    message: 'Bridge pier resultant tilt exceeded warning limit 1.000°.',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let nextRuleId = 4;

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

      if (!Array.isArray(emails) || emails.length === 0) {
        return reply.status(400).send({ statusCode: 400, message: 'Please specify at least one recipient email address.' });
      }

      const ruleData = {
        ruleName,
        projectId: projectId || null,
        projectName: projectName || null,
        siteId: siteId || null,
        siteName: siteName || null,
        assetId: assetId || null,
        assetName: assetName || null,
        deviceIds,
        emails,
        parameter,
        operator,
        thresholdValue: parseFloat(thresholdValue) || 2.0,
        severity,
        message: message || `${parameter.toUpperCase()} exceeded threshold limit ${thresholdValue}`,
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
      if (Array.isArray(emails)) updates.emails = emails;
      if (parameter !== undefined) updates.parameter = parameter;
      if (operator !== undefined) updates.operator = operator;
      if (thresholdValue !== undefined) updates.thresholdValue = parseFloat(thresholdValue);
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

      try {
        await AlertRule.destroy({ where: { id } });
      } catch (dbErr) {
        // Fallback
      }

      memoryAlertRules = memoryAlertRules.filter(r => String(r.id) !== String(id));

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

      const activeRecipients = Array.isArray(targetRule.emails) && targetRule.emails.length > 0
        ? targetRule.emails
        : await getActiveRecipientEmails();

      const alertResult = await triggerManualAlert({
        deviceIds: targetRule.deviceIds || ['DEV-001'],
        parameter: targetRule.parameter || 'tilt',
        severity: targetRule.severity || 'CRITICAL',
        tiltValue: targetRule.parameter === 'tilt' ? (targetRule.thresholdValue || 2.45) : 0,
        displacementValue: targetRule.parameter === 'displacement' ? (targetRule.thresholdValue || 12.8) : 0,
        customMessage: targetRule.message || `Breach detected for rule: ${targetRule.ruleName}`,
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
      // 1. Projects
      const projects = [
        { id: 'PROJ-01', name: 'Metro Line Expansion Corridor', code: 'METRO-EXP' },
        { id: 'PROJ-02', name: 'High-Speed Rail Viaduct Package 4', code: 'HSR-PKG4' },
        { id: 'PROJ-03', name: 'Hydroelectric Tailings Dam Safety', code: 'DAM-SAFE' },
      ];

      // 2. Locations (Sites)
      const locations = [
        { id: 'SITE-01', projectId: 'PROJ-01', name: 'Cut Slope Beta', code: 'CS-BETA' },
        { id: 'SITE-02', projectId: 'PROJ-01', name: 'Metro Deep Shaft 04', code: 'SHAFT-04' },
        { id: 'SITE-03', projectId: 'PROJ-02', name: 'Bridge Viaduct Pier 12', code: 'VIADUCT-12' },
        { id: 'SITE-04', projectId: 'PROJ-02', name: 'Excavation Pit Zone 2', code: 'PIT-Z2' },
        { id: 'SITE-05', projectId: 'PROJ-03', name: 'Tailings Embankment East', code: 'EMBANK-E' },
      ];

      // 3. Assets (Structures)
      const assets = [
        { id: 'ASSET-01', siteId: 'SITE-01', projectId: 'PROJ-01', name: 'Retaining Wall Alpha', type: 'Retaining Wall' },
        { id: 'ASSET-02', siteId: 'SITE-02', projectId: 'PROJ-01', name: 'Tunnel Shaft Grouting Ring', type: 'Tunnel Shaft' },
        { id: 'ASSET-03', siteId: 'SITE-03', projectId: 'PROJ-02', name: 'Bridge Pier BP-12', type: 'Bridge Pier' },
        { id: 'ASSET-04', siteId: 'SITE-04', projectId: 'PROJ-02', name: 'Sheet Pile Cutoff Wall', type: 'Slope Barrier' },
        { id: 'ASSET-05', siteId: 'SITE-05', projectId: 'PROJ-03', name: 'Dam Crest Inclinometer Array', type: 'Dam Abutment' },
      ];

      // 4. Devices
      const devices = [
        {
          id: 'DEV-001',
          projectId: 'PROJ-01',
          siteId: 'SITE-01',
          assetId: 'ASSET-01',
          name: 'Inclinometer East Slope A1',
          type: 'BIAXIAL_TILTMETER',
          status: 'ONLINE',
          resultantTilt: 0.325,
          totalDisplacement: 2.15,
        },
        {
          id: 'DEV-002',
          projectId: 'PROJ-01',
          siteId: 'SITE-02',
          assetId: 'ASSET-02',
          name: 'Inclinometer West Wall B2',
          type: 'SUBSURFACE_INCLINOMETER',
          status: 'ONLINE',
          resultantTilt: 0.180,
          totalDisplacement: 1.85,
        },
        {
          id: 'DEV-003',
          projectId: 'PROJ-02',
          siteId: 'SITE-03',
          assetId: 'ASSET-03',
          name: 'Inclinometer North Pier C3',
          type: 'STRUCTURAL_TILTMETER',
          status: 'ONLINE',
          resultantTilt: 0.412,
          totalDisplacement: 3.40,
        },
        {
          id: 'DEV-004',
          projectId: 'PROJ-02',
          siteId: 'SITE-04',
          assetId: 'ASSET-04',
          name: 'Inclinometer South Retaining D4',
          type: 'RETAINING_WALL_MONITOR',
          status: 'ONLINE',
          resultantTilt: 0.260,
          totalDisplacement: 2.90,
        },
        {
          id: 'DEV-005',
          projectId: 'PROJ-03',
          siteId: 'SITE-05',
          assetId: 'ASSET-05',
          name: 'Inclinometer Subsurface Borehole E5',
          type: 'BOREHOLE_INCLINOMETER',
          status: 'ONLINE',
          resultantTilt: 0.150,
          totalDisplacement: 1.10,
        },
      ];

      return reply.send({
        statusCode: 200,
        projects,
        locations,
        assets,
        devices,
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

  // 3.1 Query Alarms List & Severity Summary
  fastify.get('/api/alarms', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      let dbAlarms = [];
      try {
        dbAlarms = await Alarm.findAll({ order: [['createdAt', 'DESC']] });
      } catch (dbErr) {
        dbAlarms = [...memoryAlarms].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      const alarmMap = new Map();
      for (const a of memoryAlarms) {
        alarmMap.set(a.id, a);
      }
      for (const a of dbAlarms) {
        const item = a.toJSON ? a.toJSON() : a;
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

  // 3.2 Fetch Devices List for Multi-Device Selection
  fastify.get('/api/alarms/devices', { preHandler: [authenticateOptional(fastify)] }, async (req, reply) => {
    try {
      const devices = [
        {
          id: 'DEV-001',
          name: 'Inclinometer East Slope A1',
          projectId: 'PROJ-01',
          siteId: 'SITE-01',
          assetId: 'ASSET-01',
          type: 'BIAXIAL_TILTMETER',
          status: 'ONLINE',
          siteName: 'Cut Slope Beta',
          resultantTilt: 0.325,
          totalDisplacement: 2.15,
        },
        {
          id: 'DEV-002',
          name: 'Inclinometer West Wall B2',
          projectId: 'PROJ-01',
          siteId: 'SITE-02',
          assetId: 'ASSET-02',
          type: 'SUBSURFACE_INCLINOMETER',
          status: 'ONLINE',
          siteName: 'Metro Deep Shaft 04',
          resultantTilt: 0.180,
          totalDisplacement: 1.85,
        },
        {
          id: 'DEV-003',
          name: 'Inclinometer North Pier C3',
          projectId: 'PROJ-02',
          siteId: 'SITE-03',
          assetId: 'ASSET-03',
          type: 'STRUCTURAL_TILTMETER',
          status: 'ONLINE',
          siteName: 'Bridge Viaduct Pier 12',
          resultantTilt: 0.412,
          totalDisplacement: 3.40,
        },
        {
          id: 'DEV-004',
          name: 'Inclinometer South Retaining D4',
          projectId: 'PROJ-02',
          siteId: 'SITE-04',
          assetId: 'ASSET-04',
          type: 'RETAINING_WALL_MONITOR',
          status: 'ONLINE',
          siteName: 'Excavation Pit Zone 2',
          resultantTilt: 0.260,
          totalDisplacement: 2.90,
        },
        {
          id: 'DEV-005',
          name: 'Inclinometer Subsurface Borehole E5',
          projectId: 'PROJ-03',
          siteId: 'SITE-05',
          assetId: 'ASSET-05',
          type: 'BOREHOLE_INCLINOMETER',
          status: 'ONLINE',
          siteName: 'Tailings Dam Embankment',
          resultantTilt: 0.150,
          totalDisplacement: 1.10,
        },
      ];

      return reply.send({
        statusCode: 200,
        devices,
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
