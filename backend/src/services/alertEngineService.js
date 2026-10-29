import { AlertRule, Alarm, Incident, Device, Site } from '../models/index.js';
import { sendAlertEmail, getActiveRecipientEmails } from './emailService.js';
import { broadcastAlarm } from '../websocket/websocket.service.js';
import { getMemoryAlertRules } from '../modules/alarms/alarms.routes.js';

// Rate-limiting cache to prevent email flood while still dispatching on breaches
const lastEmailSentAt = new Map();
const EMAIL_COOLDOWN_MS = 25000; // 25 seconds debounce per device+parameter

/**
 * Compares a measured telemetry value against a rule threshold using the rule's operator.
 */
function checkThresholdBreach(val, threshold, operator = '>') {
  const numVal = parseFloat(val);
  const numThresh = parseFloat(threshold);
  if (isNaN(numVal) || isNaN(numThresh)) return false;

  switch (operator) {
    case '<':
      return numVal < numThresh;
    case '<=':
      return numVal <= numThresh;
    case '>=':
      return numVal >= numThresh;
    case '>':
    default:
      return numVal > numThresh;
  }
}

/**
 * Evaluates live telemetry data against geotechnical safety thresholds and configured alert rules.
 * Automatically evaluates rules assigned to this particular device.
 */
export async function evaluateTelemetryAlerts(device, telemetry) {
  if (!device || !telemetry) return [];

  const triggeredAlerts = [];
  const devId = String(device.id || device.deviceId || '').trim();
  const siteId = device.siteId || (device.Site ? device.Site.id : null);
  const devName = device.name || devId;

  // 1. Calculate live measurements
  const rawTilt = telemetry.tilt?.tilt ?? telemetry.resultantTilt ?? device.resultantTilt ?? 0;
  const tiltVal = Math.abs(parseFloat(rawTilt) || 0);

  const rawXDisp = telemetry.displacement?.xDisplacement_mm ?? telemetry.xDisplacement ?? device.xDisplacement ?? 0;
  const rawYDisp = telemetry.displacement?.yDisplacement_mm ?? telemetry.yDisplacement ?? device.yDisplacement ?? 0;
  const rawTotalDisp = telemetry.displacement?.totalDisplacement_mm ?? telemetry.totalDisplacement ?? device.totalDisplacement ?? null;

  const xDisp = Math.abs(parseFloat(rawXDisp) || 0);
  const yDisp = Math.abs(parseFloat(rawYDisp) || 0);
  const dispVal = rawTotalDisp !== null ? Math.abs(parseFloat(rawTotalDisp) || 0) : Math.sqrt(xDisp * xDisp + yDisp * yDisp);

  // 2. Fetch all enabled AlertRules matching THIS particular device
  let allRules = [];
  try {
    const dbRules = await AlertRule.findAll({ where: { enabled: true } });
    if (dbRules && dbRules.length > 0) {
      allRules = dbRules.map(r => (r.toJSON ? r.toJSON() : r));
    }
  } catch (dbErr) {
    // DB fallback
  }

  try {
    const memRules = typeof getMemoryAlertRules === 'function' ? getMemoryAlertRules() : [];
    for (const mRule of memRules) {
      if (mRule && mRule.enabled && !allRules.some(r => String(r.id) === String(mRule.id))) {
        allRules.push(mRule);
      }
    }
  } catch (memErr) {}

  // Filter rules targeting THIS particular device
  const deviceSpecificRules = allRules.filter(r => {
    if (!r.enabled) return false;
    const ids = Array.isArray(r.deviceIds) ? r.deviceIds : [];
    return ids.some(id => String(id).trim().toUpperCase() === devId.toUpperCase());
  });

  console.log(`[Alert Engine] Evaluating telemetry for device "${devId}". Found ${deviceSpecificRules.length} matching rule(s). (Tilt: ${tiltVal.toFixed(3)}°, Disp: ${dispVal.toFixed(2)}mm)`);

  if (deviceSpecificRules.length > 0) {
    // Evaluate configured rules for this device
    for (const rule of deviceSpecificRules) {
      const param = (rule.parameter || 'tilt').toLowerCase();
      const measuredVal = param === 'tilt' ? tiltVal : dispVal;
      const unit = param === 'tilt' ? '°' : 'mm';
      const op = rule.operator || '>';

      const cThresh = rule.criticalThreshold ?? rule.thresholdValue ?? (param === 'tilt' ? 2.0 : 10.0);
      const wThresh = rule.warningThreshold ?? (param === 'tilt' ? 1.0 : 5.0);
      const iThresh = rule.infoThreshold ?? (param === 'tilt' ? 0.5 : 2.0);

      let breachedSeverity = null;
      let limitValue = null;

      // Evaluate 3 severity tiers in order of precedence: Critical > Warning > Info
      if (checkThresholdBreach(measuredVal, cThresh, op)) {
        breachedSeverity = 'CRITICAL';
        limitValue = `${op} ${Number(cThresh).toFixed(2)} ${unit}`;
      } else if (checkThresholdBreach(measuredVal, wThresh, op)) {
        breachedSeverity = 'WARNING';
        limitValue = `${op} ${Number(wThresh).toFixed(2)} ${unit}`;
      } else if (checkThresholdBreach(measuredVal, iThresh, op)) {
        breachedSeverity = 'INFO';
        limitValue = `${op} ${Number(iThresh).toFixed(2)} ${unit}`;
      }

      if (breachedSeverity) {
        console.warn(`🚨 [AUTO-TRIGGER ALERT] Device ${devId} breached rule "${rule.ruleName}" (${breachedSeverity}) | Value: ${measuredVal.toFixed(3)} ${unit} vs Limit: ${limitValue}`);
        triggeredAlerts.push({
          deviceId: devId,
          siteId,
          siteName: device.Site?.name || 'Main Geotechnical Site',
          deviceName: devName,
          parameter: param,
          severity: breachedSeverity,
          value: `${measuredVal.toFixed(3)} ${unit}`,
          threshold: `${limitValue} (${breachedSeverity} Limit)`,
          title: `${breachedSeverity} ${param.toUpperCase()} Alert: ${rule.ruleName}`,
          message: rule.message || `${param.toUpperCase()} threshold limit (${limitValue}) breached on device ${devId} (${devName}). Rule: "${rule.ruleName}".`,
          recipients: Array.isArray(rule.emails) && rule.emails.length > 0 ? rule.emails : null,
        });
      }
    }
  } else {
    // Fallback: Default geotechnical safety limits if no custom rule assigned yet
    if (tiltVal > 2.0) {
      triggeredAlerts.push({
        deviceId: devId,
        siteId,
        deviceName: devName,
        parameter: 'tilt',
        severity: 'CRITICAL',
        value: `${tiltVal.toFixed(3)}°`,
        threshold: '2.000° (Critical Limit)',
        title: `Critical Tilt Threshold Exceeded: ${tiltVal.toFixed(3)}°`,
        message: `Resultant tilt on device ${devId} (${devName}) reached ${tiltVal.toFixed(3)}°, breaching the critical safety limit of 2.000°. Immediate inspection required.`,
      });
    } else if (tiltVal > 1.0) {
      triggeredAlerts.push({
        deviceId: devId,
        siteId,
        deviceName: devName,
        parameter: 'tilt',
        severity: 'WARNING',
        value: `${tiltVal.toFixed(3)}°`,
        threshold: '1.000° (Warning Limit)',
        title: `Tilt Warning Threshold Exceeded: ${tiltVal.toFixed(3)}°`,
        message: `Resultant tilt on device ${devId} (${devName}) reached ${tiltVal.toFixed(3)}°, exceeding the warning threshold of 1.000°.`,
      });
    }

    if (dispVal > 10.0) {
      triggeredAlerts.push({
        deviceId: devId,
        siteId,
        deviceName: devName,
        parameter: 'displacement',
        severity: 'CRITICAL',
        value: `${dispVal.toFixed(2)} mm`,
        threshold: '10.00 mm (Critical Limit)',
        title: `Critical Displacement Exceeded: ${dispVal.toFixed(2)} mm`,
        message: `Subsurface lateral displacement on device ${devId} (${devName}) reached ${dispVal.toFixed(2)} mm, exceeding the critical limit of 10.00 mm.`,
      });
    } else if (dispVal > 5.0) {
      triggeredAlerts.push({
        deviceId: devId,
        siteId,
        deviceName: devName,
        parameter: 'displacement',
        severity: 'WARNING',
        value: `${dispVal.toFixed(2)} mm`,
        threshold: '5.00 mm (Warning Limit)',
        title: `Displacement Warning Exceeded: ${dispVal.toFixed(2)} mm`,
        message: `Subsurface lateral displacement on device ${devId} (${devName}) reached ${dispVal.toFixed(2)} mm, exceeding the warning threshold of 5.00 mm.`,
      });
    }
  }

  // 3. Process, persist, broadcast, and email-dispatch alerts
  for (const alt of triggeredAlerts) {
    try {
      const alarmId = `ALM-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

      // Check if an active alarm already exists for this device and parameter
      let alarm = null;
      try {
        const existingActiveAlarm = await Alarm.findOne({
          where: {
            deviceId: alt.deviceId,
            parameter: alt.parameter,
            status: 'ACTIVE',
          },
        });

        if (existingActiveAlarm) {
          await existingActiveAlarm.update({
            message: alt.message,
            severity: alt.severity,
            value: parseFloat(alt.value) || 0,
            threshold: parseFloat(alt.threshold) || 0,
            updatedAt: new Date(),
          });
          alarm = existingActiveAlarm;
        } else {
          alarm = await Alarm.create({
            id: alarmId,
            deviceId: alt.deviceId,
            siteId: alt.siteId ? String(alt.siteId) : null,
            parameter: alt.parameter,
            type: alt.parameter.toUpperCase(),
            severity: alt.severity,
            message: alt.message,
            value: parseFloat(alt.value) || 0,
            threshold: parseFloat(alt.threshold) || 0,
            status: 'ACTIVE',
          });
        }
      } catch (dbErr) {
        // Fallback alarm object if DB running in fallback mode
        alarm = {
          id: alarmId,
          deviceId: alt.deviceId,
          siteId: alt.siteId,
          parameter: alt.parameter,
          type: alt.parameter.toUpperCase(),
          severity: alt.severity,
          message: alt.message,
          value: alt.value,
          threshold: alt.threshold,
          createdAt: new Date(),
          status: 'ACTIVE',
        };
      }

      // Create Incident if critical
      if (alt.severity === 'CRITICAL' || alt.severity === 'EMERGENCY') {
        try {
          const incidentCode = `INC-${Date.now().toString().slice(-6)}`;
          await Incident.create({
            incidentCode,
            deviceId: alt.deviceId,
            siteId: alt.siteId ? String(alt.siteId) : null,
            alarmId: alarm.id,
            title: alt.title,
            severity: alt.severity,
            status: 'NEW',
            rootCause: `Automated ${alt.parameter} threshold breach detected by Alert Engine.`,
          });
        } catch (incErr) {
          // Non-blocking
        }
      }

      // Broadcast Alarm via WebSocket to live UI
      if (broadcastAlarm) {
        broadcastAlarm(alarm);
      }

      // Debounce email dispatches to prevent inbox flooding on rapid telemetry cycles
      const cacheKey = `${alt.deviceId}_${alt.parameter}`;
      const lastSent = lastEmailSentAt.get(cacheKey) || 0;
      const now = Date.now();

      if (now - lastSent > EMAIL_COOLDOWN_MS || alt.severity === 'CRITICAL') {
        lastEmailSentAt.set(cacheKey, now);
        sendAlertEmail({
          alert: alt,
          device,
          recipients: alt.recipients || null,
        }).catch(err => {
          console.warn(`[Alert Engine] Error auto-sending alert email for ${alt.deviceId}:`, err.message);
        });
      }
    } catch (e) {
      console.warn(`[Alert Engine] Error recording alert for ${alt.deviceId}:`, e.message);
    }
  }

  return triggeredAlerts;
}

/**
 * Manually generates and dispatches geotechnical alerts for multiple selected devices
 * and delivers real HTML notification emails to multiple recipient addresses.
 */
export async function triggerManualAlert({
  deviceIds = [],
  parameter = 'tilt', // 'tilt', 'displacement', or 'both'
  severity = 'CRITICAL',
  tiltValue = 2.45,
  displacementValue = 12.8,
  customMessage = null,
  recipients = null,
}) {
  const targetDeviceIds = Array.isArray(deviceIds) && deviceIds.length > 0 ? deviceIds : ['DEV-001'];
  const results = [];

  // Determine recipients
  let targetEmails = recipients;
  if (!targetEmails || targetEmails.length === 0) {
    targetEmails = await getActiveRecipientEmails();
  }

  for (const devId of targetDeviceIds) {
    // 1. Fetch device details if available
    let deviceObj = { id: devId, name: `Inclinometer Sensor ${devId}` };
    try {
      const dbDev = await Device.findByPk(devId, { include: [Site] });
      if (dbDev) {
        deviceObj = dbDev.toJSON ? dbDev.toJSON() : dbDev;
      }
    } catch (err) {
      // Use fallback
    }

    const alertsToTrigger = [];

    // Parameter checks
    if (parameter === 'tilt' || parameter === 'both') {
      const tVal = parseFloat(tiltValue) || 2.45;
      alertsToTrigger.push({
        deviceId: devId,
        siteId: deviceObj.siteId,
        siteName: deviceObj.Site?.name || 'Main Geotechnical Site',
        deviceName: deviceObj.name || devId,
        parameter: 'tilt',
        severity: severity.toUpperCase(),
        value: `${tVal.toFixed(3)}°`,
        threshold: severity === 'CRITICAL' ? '2.000° (Critical Limit)' : '1.000° (Warning Limit)',
        title: `Operator Generated Tilt Alert: ${tVal.toFixed(3)}° on ${devId}`,
        message: customMessage || `Manual simulation breach: Resultant tilt reached ${tVal.toFixed(3)}° (Threshold: ${severity === 'CRITICAL' ? '2.000°' : '1.000°'}).`,
      });
    }

    if (parameter === 'displacement' || parameter === 'both') {
      const dVal = parseFloat(displacementValue) || 12.8;
      alertsToTrigger.push({
        deviceId: devId,
        siteId: deviceObj.siteId,
        siteName: deviceObj.Site?.name || 'Main Geotechnical Site',
        deviceName: deviceObj.name || devId,
        parameter: 'displacement',
        severity: severity.toUpperCase(),
        value: `${dVal.toFixed(2)} mm`,
        threshold: severity === 'CRITICAL' ? '10.00 mm (Critical Limit)' : '5.00 mm (Warning Limit)',
        title: `Operator Generated Displacement Alert: ${dVal.toFixed(2)} mm on ${devId}`,
        message: customMessage || `Manual simulation breach: Subsurface lateral displacement reached ${dVal.toFixed(2)} mm (Threshold: ${severity === 'CRITICAL' ? '10.00 mm' : '5.00 mm'}).`,
      });
    }

    for (const alt of alertsToTrigger) {
      const alarmId = `ALM-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

      // Persist or record Alarm
      let alarm = null;
      try {
        alarm = await Alarm.create({
          id: alarmId,
          deviceId: alt.deviceId,
          siteId: alt.siteId ? String(alt.siteId) : null,
          parameter: alt.parameter,
          type: alt.parameter.toUpperCase(),
          severity: alt.severity,
          message: alt.message,
          value: parseFloat(alt.value) || 0,
          threshold: parseFloat(alt.threshold) || 0,
          status: 'ACTIVE',
        });
      } catch (e) {
        alarm = {
          id: alarmId,
          deviceId: alt.deviceId,
          siteId: alt.siteId,
          parameter: alt.parameter,
          type: alt.parameter.toUpperCase(),
          severity: alt.severity,
          message: alt.message,
          value: alt.value,
          threshold: alt.threshold,
          createdAt: new Date(),
          status: 'ACTIVE',
        };
      }

      // Broadcast to WebSockets
      if (broadcastAlarm) {
        broadcastAlarm(alarm);
      }

        results.push({
          deviceId: devId,
          parameter: alt.parameter,
          severity: alt.severity,
          alarmId: alarm.id || alarmId,
        });
      }
    }

    // Dispatch real email via SMTP for the alert trigger
    let emailResult = { success: false };
    try {
      const summaryDeviceLabel = targetDeviceIds.length === 1
        ? targetDeviceIds[0]
        : `${targetDeviceIds.length} Devices (${targetDeviceIds.slice(0, 4).join(', ')}${targetDeviceIds.length > 4 ? '...' : ''})`;

      const primaryAlert = {
        deviceId: summaryDeviceLabel,
        parameter,
        severity: severity.toUpperCase(),
        value: parameter === 'tilt' ? `${(parseFloat(tiltValue) || 2.45).toFixed(3)}°` : `${(parseFloat(displacementValue) || 12.8).toFixed(2)} mm`,
        threshold: severity === 'CRITICAL' ? (parameter === 'tilt' ? '2.000°' : '10.00 mm') : (parameter === 'tilt' ? '1.000°' : '5.00 mm'),
        title: targetDeviceIds.length === 1
          ? `Geotechnical Alert: ${targetDeviceIds[0]} - ${severity.toUpperCase()}`
          : `Geotechnical Multi-Device Alert: ${targetDeviceIds.length} Units - ${severity.toUpperCase()}`,
        message: customMessage || `Geotechnical threshold limit exceeded for ${parameter.toUpperCase()} on ${targetDeviceIds.length} monitored device(s): ${targetDeviceIds.join(', ')}.`,
      };

      emailResult = await sendAlertEmail({
        alert: primaryAlert,
        device: { id: summaryDeviceLabel, name: `Inclinometer Array (${targetDeviceIds.length} devices)` },
        recipients: targetEmails,
      });
    } catch (mailErr) {
      console.error('[AlertEngine] SMTP send error:', mailErr);
      emailResult = { success: false, error: mailErr.message };
    }

    return {
      success: true,
      totalDispatches: results.length,
      deviceCount: targetDeviceIds.length,
      recipients: targetEmails,
      emailResult,
      dispatches: results,
    };
}
