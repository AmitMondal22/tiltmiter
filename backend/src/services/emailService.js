import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';
import { NotificationGroup, Device, Site, Structure, Project } from '../models/index.js';

/**
 * Validates an email address format.
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Global in-memory recipient store for persistence across DB fallback modes.
 */
let memoryRecipients = (process.env.ALERT_EMAIL_RECIPIENTS || 'system@techavo.in')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(e => isValidEmail(e) && !e.includes('tiltmeter.io'));

if (memoryRecipients.length === 0) {
  memoryRecipients = ['system@techavo.in'];
}

export function getMemoryRecipients() {
  return [...memoryRecipients];
}

export function setMemoryRecipients(list) {
  if (Array.isArray(list)) {
    const clean = Array.from(new Set(list.filter(isValidEmail).map(e => e.trim().toLowerCase())));
    if (clean.length > 0) {
      memoryRecipients = clean;
      process.env.ALERT_EMAIL_RECIPIENTS = clean.join(',');
    }
  }
  return [...memoryRecipients];
}

/**
 * Retrieves normalized SMTP configuration credentials from environment variables.
 * Supports both SMTP_USERNAME / SMTP_USER and SMTP_PASSWORD / SMTP_PASS conventions.
 */
export function getSmtpCredentials() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_USE_SSL === 'true' || port === 465;
  const user = process.env.SMTP_USERNAME || process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || (user ? `Inclinometer Alert System <${user}>` : 'Inclinometer Alert System <alerts@inclinox.com>');

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    configured: Boolean(user && pass),
  };
}

/**
 * Creates and returns a configured Nodemailer SMTP transporter.
 */
export function getTransporter() {
  const { host, port, secure, user, pass } = getSmtpCredentials();

  const transportConfig = {
    host,
    port,
    secure,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 18000,
    tls: {
      rejectUnauthorized: false,
    },
  };

  // If credentials are provided, authenticate
  if (user && pass) {
    transportConfig.auth = { user, pass };
  }

  return nodemailer.createTransport(transportConfig);
}

/**
 * Retrieves the full list of active recipient emails from DB, memory store, and environment.
 */
export async function getActiveRecipientEmails() {
  const emailSet = new Set();

  // 1. Fetch from NotificationGroup in database if active
  try {
    const groups = await NotificationGroup.findAll({ where: { enabled: true } });
    for (const group of groups) {
      if (Array.isArray(group.recipients)) {
        for (const r of group.recipients) {
          if (typeof r === 'string' && isValidEmail(r)) {
            emailSet.add(r.trim().toLowerCase());
          } else if (typeof r === 'object' && r?.email && isValidEmail(r.email)) {
            emailSet.add(r.email.trim().toLowerCase());
          }
        }
      }
    }
  } catch (err) {
    // Expected if DB running in fallback mode
  }

  // 2. Fetch from in-memory distribution list
  for (const em of memoryRecipients) {
    if (isValidEmail(em)) {
      emailSet.add(em.trim().toLowerCase());
    }
  }

  // 3. Fallback to process.env.ALERT_EMAIL_RECIPIENTS
  const envRecipients = process.env.ALERT_EMAIL_RECIPIENTS || '';
  if (envRecipients) {
    envRecipients.split(',').forEach(em => {
      if (isValidEmail(em)) {
        emailSet.add(em.trim().toLowerCase());
      }
    });
  }

  // 4. Default to SMTP user/sender if completely empty
  if (emailSet.size === 0) {
    const { user, from } = getSmtpCredentials();
    if (user && isValidEmail(user)) emailSet.add(user.toLowerCase());
    else emailSet.add('system@techavo.in');
  }

  return Array.from(emailSet).filter(e => typeof e === 'string' && !e.toLowerCase().includes('tiltmeter.io'));
}

/**
 * Verifies SMTP configuration connectivity.
 */
export async function verifySmtp() {
  const { host, port, user, pass, from, configured } = getSmtpCredentials();

  if (!configured) {
    return {
      configured: false,
      connected: false,
      message: 'SMTP credentials (SMTP_USERNAME / SMTP_PASSWORD) not configured in .env',
      host,
      port,
    };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return {
      configured: true,
      connected: true,
      message: `Successfully connected and authenticated with SMTP server ${host}:${port} (${user})`,
      host,
      port,
      user,
      from,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      message: `SMTP Connection failed: ${err.message}`,
      host,
      port,
      user,
      error: err.message,
    };
  }
}

/**
 * Sends an automated Alert notification email to multiple recipients.
 *
 * @param {Object} options
 * @param {Object} options.alert - Alert details { deviceId, parameter, severity, title, message, value, threshold }
 * @param {Object} [options.device] - Device object
 * @param {string[]} [options.recipients] - Optional explicit list of email addresses
 * @param {string} [options.customSubject] - Optional custom subject line
 */
export async function sendAlertEmail({ alert, device = {}, recipients = null, customSubject = null }) {
  if (!alert) {
    return { success: false, reason: 'NO_ALERT_PAYLOAD' };
  }

  // Check if auto send is enabled
  const autoSendEnabled = process.env.ALERT_AUTO_SEND_EMAIL !== 'false';
  if (!autoSendEnabled && !recipients) {
    console.log('[EmailService] Auto-send email alerts is disabled in configuration.');
    return { success: false, reason: 'ALERT_AUTO_SEND_EMAIL_DISABLED' };
  }

  // Determine recipients
  let targetEmails = recipients;
  if (!targetEmails || targetEmails.length === 0) {
    targetEmails = await getActiveRecipientEmails();
  }

  // Filter and deduplicate valid emails
  const cleanRecipients = Array.from(
    new Set((targetEmails || []).filter(isValidEmail).map(e => e.trim().toLowerCase()))
  );

  if (cleanRecipients.length === 0) {
    console.warn(`[EmailService] No valid recipient emails found for alert on device ${alert.deviceId}.`);
    return { success: false, reason: 'NO_VALID_RECIPIENTS' };
  }

  const rawDeviceId = alert.deviceId || device.id || 'UNKNOWN';
  let enrichedDevice = { ...(device || {}) };

  // If a single concrete device ID is targeted, look up complete hierarchical associations
  if (rawDeviceId && typeof rawDeviceId === 'string' && !rawDeviceId.includes('Devices') && (!enrichedDevice.Site || !enrichedDevice.Structure || !enrichedDevice.Project)) {
    try {
      const dbDev = await Device.findByPk(rawDeviceId, {
        include: [
          { model: Site, include: [Project] },
          { model: Structure },
          { model: Project }
        ]
      });
      if (dbDev) {
        const jsonDev = dbDev.toJSON ? dbDev.toJSON() : dbDev;
        enrichedDevice = { ...jsonDev, ...enrichedDevice };
      }
    } catch (enrichErr) {
      // Continue with provided device metadata
    }
  }

  const deviceId = rawDeviceId;
  const deviceName = enrichedDevice.name || alert.deviceName || deviceId;

  // 1. Project Information
  const projectName = alert.projectName
    || enrichedDevice.Project?.name
    || enrichedDevice.Site?.Project?.name
    || (enrichedDevice.projectId ? `Project #${enrichedDevice.projectId}` : 'Default Geotechnical Project');

  // 2. Site Location & Coordinates
  const siteName = alert.siteName || enrichedDevice.Site?.name || (enrichedDevice.siteId ? `Site ${enrichedDevice.siteId}` : 'Main Geotechnical Site');
  const siteLat = alert.siteLatitude ?? enrichedDevice.Site?.latitude ?? null;
  const siteLng = alert.siteLongitude ?? enrichedDevice.Site?.longitude ?? null;
  const siteLocationStr = (siteLat !== null && siteLng !== null)
    ? `${Number(siteLat).toFixed(4)}° N, ${Number(siteLng).toFixed(4)}° E`
    : (enrichedDevice.Site?.location || enrichedDevice.Site?.address || 'Site Coordinates Set');
  const siteMapUrl = (siteLat !== null && siteLng !== null) ? `https://www.google.com/maps?q=${siteLat},${siteLng}` : null;

  // 3. Structural Asset & Coordinates
  const structureName = alert.structureName
    || enrichedDevice.Structure?.name
    || (enrichedDevice.structureId ? `Structural Asset ${enrichedDevice.structureId}` : 'Slope Structural Asset');
  const structureType = alert.structureType || enrichedDevice.Structure?.type || enrichedDevice.structureType || 'Mountain Slope';
  const structureLat = alert.structureLatitude ?? enrichedDevice.Structure?.latitude ?? siteLat;
  const structureLng = alert.structureLongitude ?? enrichedDevice.Structure?.longitude ?? siteLng;
  const structureLocationStr = (structureLat !== null && structureLng !== null)
    ? `${Number(structureLat).toFixed(4)}° N, ${Number(structureLng).toFixed(4)}° E`
    : 'Asset Coordinates Set';
  const structureMapUrl = (structureLat !== null && structureLng !== null) ? `https://www.google.com/maps?q=${structureLat},${structureLng}` : siteMapUrl;

  // 4. Device Coordinates & Direct Map Link
  const deviceLat = alert.latitude ?? enrichedDevice.latitude ?? structureLat;
  const deviceLng = alert.longitude ?? enrichedDevice.longitude ?? structureLng;
  const deviceLocationStr = (deviceLat !== null && deviceLng !== null) ? `${Number(deviceLat).toFixed(4)}° N, ${Number(deviceLng).toFixed(4)}° E` : null;
  const deviceMapUrl = (deviceLat !== null && deviceLng !== null) ? `https://www.google.com/maps?q=${deviceLat},${deviceLng}` : (structureMapUrl || siteMapUrl);
  const primaryGoogleMapUrl = deviceMapUrl || structureMapUrl || siteMapUrl;

  // 5. Alert Parameters & Tilt X/Y Values
  const severity = (alert.severity || 'WARNING').toUpperCase();
  const parameter = (alert.parameter || 'tilt').toUpperCase();
  const isTiltParam = parameter === 'TILT';
  const isDisplacement = parameter === 'DISPLACEMENT';

  // Format angle helper
  const formatAngle = (val, defaultVal = '0.000°') => {
    if (val === null || val === undefined) return defaultVal;
    const num = parseFloat(val);
    if (isNaN(num)) return String(val).endsWith('°') ? val : `${val}°`;
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(3)}°`;
  };

  // Extract Tilt X, Tilt Y, Resultant Tilt
  let rawTiltX = alert.tiltX ?? alert.xTilt ?? enrichedDevice.xTilt ?? null;
  let rawTiltY = alert.tiltY ?? alert.yTilt ?? enrichedDevice.yTilt ?? null;
  let rawResultantTilt = alert.resultantTilt ?? (isTiltParam ? alert.value : enrichedDevice.resultantTilt);

  // If manual simulation or rule gave resultant tilt, compute realistic vector split if x/y empty
  if ((rawTiltX === null || rawTiltY === null) && rawResultantTilt !== null && rawResultantTilt !== undefined) {
    const rNum = parseFloat(rawResultantTilt) || 0;
    if (rNum > 0) {
      const comp = (rNum * 0.7071).toFixed(3);
      if (rawTiltX === null) rawTiltX = `+${comp}`;
      if (rawTiltY === null) rawTiltY = `+${comp}`;
    }
  }

  const formattedTiltX = formatAngle(rawTiltX);
  const formattedTiltY = formatAngle(rawTiltY);
  const formattedResultantTilt = formatAngle(rawResultantTilt);

  // Extract Displacement X, Y, Total if applicable
  let rawDispX = alert.dispX ?? alert.xDisplacement ?? enrichedDevice.xDisplacement ?? null;
  let rawDispY = alert.dispY ?? alert.yDisplacement ?? enrichedDevice.yDisplacement ?? null;
  let rawTotalDisp = alert.totalDisp ?? alert.totalDisplacement ?? (isDisplacement ? alert.value : enrichedDevice.totalDisplacement);
  if ((rawDispX === null || rawDispY === null) && rawTotalDisp !== null && rawTotalDisp !== undefined) {
    const dNum = parseFloat(rawTotalDisp) || 0;
    if (dNum > 0) {
      const dComp = (dNum * 0.7071).toFixed(2);
      if (rawDispX === null) rawDispX = `${dComp} mm`;
      if (rawDispY === null) rawDispY = `${dComp} mm`;
    }
  }

  const title = alert.title || `${severity} ${parameter} Threshold Exceeded on Device ${deviceId}`;
  const message = alert.message || `${parameter} measurement exceeded safety threshold limits.`;
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long' });
  const utcTimestamp = new Date().toISOString();

  const isCritical = severity === 'CRITICAL' || severity === 'EMERGENCY';
  const accentColor = isCritical ? '#dc2626' : (severity === 'MAJOR' ? '#ea580c' : '#2563eb');
  const badgeBg = isCritical ? '#fee2e2' : (severity === 'MAJOR' ? '#ffedd5' : '#dbeafe');

  const subject = customSubject || `[INCLINOX ${severity}] ${title} | ${projectName} - ${siteName}`;
  const { from: senderFrom } = getSmtpCredentials();
  const portalUrl = `http://localhost:5173/#/devices/${deviceId}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 660px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.07); }
    .header { background: #0f172a; padding: 28px 24px; color: #ffffff; text-align: left; }
    .header-tag { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 6px; }
    .header h1 { margin: 4px 0 8px 0; font-size: 20px; letter-spacing: -0.5px; font-weight: 800; display: flex; align-items: center; gap: 8px; line-height: 1.3; }
    .badge { display: inline-block; padding: 5px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; background: ${badgeBg}; color: ${accentColor}; margin-top: 6px; }
    .content { padding: 28px 24px; }
    .alert-box { background: #f8fafc; border-left: 5px solid ${accentColor}; border-radius: 8px; padding: 18px; margin-bottom: 22px; }
    .alert-title { font-size: 15.5px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
    .alert-msg { font-size: 13.5px; color: #475569; line-height: 1.6; margin: 0; }
    
    .section-header { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #475569; margin: 20px 0 10px 0; display: flex; align-items: center; gap: 6px; }
    
    .grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .grid td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; font-size: 13px; vertical-align: top; }
    .grid tr:last-child td { border-bottom: none; }
    .grid td.label { color: #64748b; font-weight: 600; width: 34%; background: #fbfcfe; }
    .grid td.val { color: #0f172a; font-weight: 600; }
    
    /* Highlighted telemetry card */
    .telemetry-card { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 22px; }
    .telemetry-title { font-size: 12.5px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .telemetry-grid { display: table; width: 100%; }
    .telemetry-cell { display: table-cell; width: 33.33%; padding: 8px 6px; text-align: center; border-right: 1px solid #e2e8f0; }
    .telemetry-cell:last-child { border-right: none; }
    .telemetry-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .telemetry-value { font-size: 17px; font-family: monospace; font-weight: 800; color: #0f172a; }
    
    .map-btn { display: inline-block; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 700; margin-top: 4px; box-shadow: 0 1px 3px rgba(2,132,199,0.25); }
    .map-btn:hover { background: #0369a1; }
    
    .btn-action-primary { display: inline-block; background: #dc2626; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 13px; font-weight: 700; text-align: center; box-shadow: 0 2px 6px rgba(220,38,38,0.3); margin-right: 10px; margin-bottom: 8px; }
    .btn-action-secondary { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 13px; font-weight: 700; text-align: center; box-shadow: 0 2px 6px rgba(37,99,235,0.3); margin-bottom: 8px; }
    
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 22px 24px; font-size: 11.5px; color: #64748b; text-align: center; line-height: 1.6; }
    .recipients-list { font-family: monospace; font-size: 11px; color: #334155; margin-top: 6px; word-break: break-all; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-tag">INCLINOX GEOTECHNICAL SAFETY MONITORING</div>
      <h1>⚠️ ${parameter} SAFETY THRESHOLD ALERT</h1>
      <span class="badge">${severity} BREACH DETECTED</span>
    </div>

    <div class="content">
      <div class="alert-box">
        <div class="alert-title">${title}</div>
        <p class="alert-msg">${message}</p>
      </div>

      <!-- 1. ALERT VALUES: TILT X, TILT Y, RESULTANT TILT -->
      <div class="telemetry-card">
        <div class="telemetry-title">⚡ Live Measured Alert Values (${parameter})</div>
        <div class="telemetry-grid">
          <div class="telemetry-cell">
            <div class="telemetry-label">Tilt X (Roll)</div>
            <div class="telemetry-value" style="color: #2563eb;">${formattedTiltX}</div>
          </div>
          <div class="telemetry-cell">
            <div class="telemetry-label">Tilt Y (Pitch)</div>
            <div class="telemetry-value" style="color: #7c3aed;">${formattedTiltY}</div>
          </div>
          <div class="telemetry-cell">
            <div class="telemetry-label">Resultant Tilt</div>
            <div class="telemetry-value" style="color: ${accentColor}; font-size: 18px;">${formattedResultantTilt}</div>
          </div>
        </div>
        ${isDisplacement && rawTotalDisp !== null ? `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #334155; font-family: monospace;">
          <strong>Displacement:</strong> X: ${rawDispX || '0.00 mm'} | Y: ${rawDispY || '0.00 mm'} | Total: <strong>${rawTotalDisp}</strong>
        </div>
        ` : ''}
      </div>

      <!-- 2. PROJECT, SITE, STRUCTURAL ASSET & DEVICE METADATA -->
      <div class="section-header">📍 Asset & Location Information</div>
      <table class="grid">
        <tr>
          <td class="label">Project Name</td>
          <td class="val" style="color: #0f172a; font-weight: 700;">📁 ${projectName}</td>
        </tr>
        <tr>
          <td class="label">Site Location</td>
          <td class="val">
            <strong>${siteName}</strong>
            ${siteLocationStr ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">Coordinates: ${siteLocationStr}</div>` : ''}
            ${siteMapUrl ? `<div style="margin-top: 6px;"><a href="${siteMapUrl}" target="_blank" class="map-btn">📍 Open Site Location in Google Maps ↗</a></div>` : ''}
          </td>
        </tr>
        <tr>
          <td class="label">Structural Asset</td>
          <td class="val">
            <strong>${structureName}</strong> <span style="font-size: 11px; color: #64748b; font-weight: normal;">(${structureType})</span>
            ${structureLocationStr ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">Coordinates: ${structureLocationStr}</div>` : ''}
            ${structureMapUrl ? `<div style="margin-top: 6px;"><a href="${structureMapUrl}" target="_blank" class="map-btn" style="background: #059669;">📍 Open Structural Asset in Google Maps ↗</a></div>` : ''}
          </td>
        </tr>
        <tr>
          <td class="label">Monitored Device</td>
          <td class="val">
            <span style="font-family: monospace; font-weight: 800; font-size: 13.5px; color: #0f172a;">${deviceId}</span>
            <span style="color: #475569; font-size: 12.5px;"> - ${deviceName}</span>
            ${deviceLocationStr ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">Sensor Coords: ${deviceLocationStr}</div>` : ''}
            ${deviceMapUrl ? `<div style="margin-top: 6px;"><a href="${deviceMapUrl}" target="_blank" class="map-btn" style="background: #4f46e5;">📍 Open Device Location in Google Maps ↗</a></div>` : ''}
          </td>
        </tr>
        <tr>
          <td class="label">Safety Threshold</td>
          <td class="val" style="font-family: monospace; font-weight: 700; color: #b91c1c;">
            ${alert.threshold !== undefined ? alert.threshold : 'Configured Safety Limit'}
          </td>
        </tr>
        <tr>
          <td class="label">Alert Severity</td>
          <td class="val" style="color: ${accentColor}; font-weight: 800;">
            ${severity} BREACH
          </td>
        </tr>
        <tr>
          <td class="label">Timestamp (IST)</td>
          <td class="val" style="font-family: monospace; font-size: 12px;">${timestamp}</td>
        </tr>
      </table>

      <!-- 3. ACTIONS & GOOGLE MAPS SHORTCUTS -->
      <div style="text-align: center; margin: 26px 0 10px 0;">
        ${primaryGoogleMapUrl ? `
        <a href="${primaryGoogleMapUrl}" target="_blank" class="btn-action-primary">
          🗺️ Open Location in Google Maps
        </a>
        ` : ''}
        <a href="${portalUrl}" target="_blank" class="btn-action-secondary">
          📊 View Device Live Telemetry Dashboard →
        </a>
      </div>
    </div>

    <div class="footer">
      <div>This geotechnical threshold alert was dispatched automatically to <strong>${cleanRecipients.length} configured recipient email(s)</strong>:</div>
      <div class="recipients-list">${cleanRecipients.join(', ')}</div>
      <div style="margin-top: 10px; font-size: 11px; color: #94a3b8;">
        Inclinox Automated Alert Engine • Real-Time Slope Stability & Subsurface Inclinometer Monitoring Platform
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const textContent = `
============================================================
[INCLINOX ${severity} ${parameter} SAFETY THRESHOLD ALERT]
============================================================
Project Name:       ${projectName}
Site Location:      ${siteName} (${siteLocationStr})
Site Google Map:    ${siteMapUrl || 'N/A'}
Structural Asset:   ${structureName} (${structureType})
Asset Google Map:   ${structureMapUrl || 'N/A'}
Monitored Device:   ${deviceName} [${deviceId}]
Device Google Map:  ${deviceMapUrl || 'N/A'}

------------------------------------------------------------
MEASURED ALERT VALUES & TELEMETRY BREACH
------------------------------------------------------------
Monitored Parameter: ${parameter}
Tilt X Axis (Roll):  ${formattedTiltX}
Tilt Y Axis (Pitch): ${formattedTiltY}
Resultant Tilt:      ${formattedResultantTilt}
${isDisplacement ? `Displacement X:      ${rawDispX || '0.00 mm'}\nDisplacement Y:      ${rawDispY || '0.00 mm'}\nTotal Displacement:  ${rawTotalDisp || '0.00 mm'}\n` : ''}Safety Threshold:    ${alert.threshold !== undefined ? alert.threshold : 'Safety Limit'}
Alert Severity:      ${severity}
Breach Summary:      ${title}
Detailed Message:    ${message}

Timestamp (IST):     ${timestamp}
Timestamp (UTC):     ${utcTimestamp}
Google Maps:         ${primaryGoogleMapUrl || 'N/A'}
Live Dashboard:      ${portalUrl}
Configured Recipients: ${cleanRecipients.join(', ')}
============================================================
  `.trim();

  // Attempt sending email via configured SMTP
  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: senderFrom,
      to: cleanRecipients,
      subject,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✓ Alert email dispatched to ${cleanRecipients.length} recipients. Message ID: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      recipients: cleanRecipients,
      severity,
      parameter,
      deviceId,
      timestamp: utcTimestamp,
    };
  } catch (err) {
    console.error(`[EmailService] ✗ Failed to send alert email via SMTP:`, err.message);
    return {
      success: false,
      error: err.message,
      recipients: cleanRecipients,
      deviceId,
    };
  }
}

/**
 * Sends a test email to verify SMTP configuration and recipient delivery.
 */
export async function sendTestEmail(targetEmail = null) {
  const recipients = targetEmail ? [targetEmail] : await getActiveRecipientEmails();
  const cleanRecipients = recipients.filter(isValidEmail);

  if (cleanRecipients.length === 0) {
    return {
      success: false,
      error: 'No valid recipient email address specified or configured in notification settings.',
    };
  }

  const { from: senderFrom, host, port } = getSmtpCredentials();
  const nowStr = new Date().toLocaleString();

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: senderFrom,
      to: cleanRecipients,
      subject: `[TEST] Inclinox Inclinometer SMTP Email Notification Verification`,
      text: `This is a test notification email sent from Inclinox Inclinometer Telemetry Platform.\nSMTP Server: ${host}:${port}\nTimestamp: ${nowStr}\nDelivery successful.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="background: #0f172a; padding: 18px; border-radius: 10px; color: #ffffff; text-align: center;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase;">INCLINOX TELEMETRY SYSTEM</div>
            <h2 style="margin: 6px 0 0 0; font-size: 17px; font-weight: 800;">✓ SMTP ALERT DISPATCH VERIFICATION</h2>
          </div>
          <div style="padding: 22px 0; font-size: 13.5px; color: #334155; line-height: 1.6;">
            <p>Hello,</p>
            <p>This test email confirms that your <strong>SMTP Mail Gateway</strong> is successfully communicating with the Inclinox Alert Engine.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin: 18px 0; font-family: monospace; font-size: 12px;">
              <div><strong>SMTP Host:</strong> ${host}:${port}</div>
              <div><strong>Sender (FROM):</strong> ${senderFrom}</div>
              <div><strong>Recipients (${cleanRecipients.length}):</strong> ${cleanRecipients.join(', ')}</div>
              <div><strong>Dispatched At:</strong> ${nowStr}</div>
            </div>
            <p>Automated threshold alert notifications for <strong>Tilt Exceedance</strong> and <strong>Lateral Displacement</strong> events will be delivered to this distribution list.</p>
          </div>
          <div style="border-top: 1px solid #f1f5f9; padding-top: 14px; font-size: 11px; color: #94a3b8; text-align: center;">
            Inclinox Telemetry System • Automated Notification Service
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✓ Test email dispatched. Message ID: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      recipients: cleanRecipients,
      host,
      port,
      sender: senderFrom,
    };
  } catch (err) {
    console.error(`[EmailService] ✗ Test email delivery failed:`, err.message);
    return {
      success: false,
      error: err.message,
      host,
      port,
      sender: senderFrom,
    };
  }
}
