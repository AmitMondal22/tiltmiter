import { AlertRule, Alarm, Incident, Device, Site } from '../models/index.js';
import { sendAlertEmail, getActiveRecipientEmails } from './emailService.js';
import { broadcastAlarm } from '../websocket/websocket.service.js';

// Rate-limiting cache to prevent email flood while still dispatching on breaches
const lastEmailSentAt = new Map();
const EMAIL_COOLDOWN_MS = 25000; // 25 seconds debounce per device+parameter

/**
 * Evaluates live telemetry data against geotechnical tilt and displacement safety thresholds.
 *
 * Threshold Rules:
 * 1. Resultant Tilt:
 *    - Critical: > 2.000°
 *    - Warning:  > 1.000°
 * 2. Lateral Displacement:
 *    - Critical: > 10.00 mm
 *    - Warning:  > 5.00 mm
 */
export async function evaluateTelemetryAlerts(device, telemetry) {
  if (!device || !telemetry) return [];

  const triggeredAlerts = [];
  const devId = device.id || device.deviceId;
  const siteId = device.siteId || (device.Site ? device.Site.id : null);
  const devName = device.name || devId;

  // 1. Tilt Threshold Evaluation
  const rawTilt = telemetry.tilt?.tilt ?? telemetry.resultantTilt ?? device.resultantTilt ?? 0;
  const tiltVal = Math.abs(parseFloat(rawTilt) || 0);

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

  // 2. Lateral Displacement Threshold Evaluation
  const rawXDisp = telemetry.displacement?.xDisplacement_mm ?? telemetry.xDisplacement ?? device.xDisplacement ?? 0;
  const rawYDisp = telemetry.displacement?.yDisplacement_mm ?? telemetry.yDisplacement ?? device.yDisplacement ?? 0;
  const rawTotalDisp = telemetry.displacement?.totalDisplacement_mm ?? telemetry.totalDisplacement ?? device.totalDisplacement ?? null;

  const xDisp = Math.abs(parseFloat(rawXDisp) || 0);
  const yDisp = Math.abs(parseFloat(rawYDisp) || 0);
  const dispVal = rawTotalDisp !== null ? Math.abs(parseFloat(rawTotalDisp) || 0) : Math.sqrt(xDisp * xDisp + yDisp * yDisp);

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

  // 3. Process, persist, and dispatch alerts
  for (const alt of triggeredAlerts) {
    try {
      const alarmId = `ALM-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

      // Check if an alarm already exists for this device and parameter
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
        sendAlertEmail({ alert: alt, device }).catch(err => {
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

      // Dispatch real email via SMTP
      const emailResult = await sendAlertEmail({
        alert: alt,
        device: deviceObj,
        recipients: targetEmails,
      });

      results.push({
        deviceId: devId,
        parameter: alt.parameter,
        severity: alt.severity,
        alarmId: alarm.id || alarmId,
        emailResult,
      });
    }
  }

  return {
    success: true,
    totalDispatches: results.length,
    deviceCount: targetDeviceIds.length,
    recipients: targetEmails,
    dispatches: results,
  };
}
