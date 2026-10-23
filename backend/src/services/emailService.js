import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';
import { NotificationGroup } from '../models/index.js';

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
  .filter(isValidEmail);

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

  return Array.from(emailSet);
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

  const deviceId = alert.deviceId || device.id || 'UNKNOWN';
  const deviceName = device.name || alert.deviceName || deviceId;
  const siteName = device.Site?.name || alert.siteName || alert.siteId || 'Main Geotechnical Site';
  const severity = (alert.severity || 'WARNING').toUpperCase();
  const parameter = (alert.parameter || 'tilt').toUpperCase();
  const title = alert.title || `${severity} ${parameter} Threshold Exceeded on Device ${deviceId}`;
  const message = alert.message || `${parameter} measurement exceeded safety threshold limits.`;
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long' });
  const utcTimestamp = new Date().toISOString();

  const isCritical = severity === 'CRITICAL' || severity === 'EMERGENCY';
  const accentColor = isCritical ? '#dc2626' : (severity === 'MAJOR' ? '#ea580c' : '#2563eb');
  const badgeBg = isCritical ? '#fee2e2' : (severity === 'MAJOR' ? '#ffedd5' : '#dbeafe');

  const subject = customSubject || `[INCLINOX ${severity}] ${title} - Device ${deviceId}`;
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
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .header { background: #0f172a; padding: 28px 24px; color: #ffffff; text-align: left; }
    .header h1 { margin: 8px 0 0 0; font-size: 20px; letter-spacing: -0.5px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
    .badge { display: inline-block; padding: 5px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; background: ${badgeBg}; color: ${accentColor}; margin-top: 10px; }
    .content { padding: 28px 24px; }
    .alert-box { background: #f8fafc; border-left: 5px solid ${accentColor}; border-radius: 8px; padding: 18px; margin-bottom: 24px; }
    .alert-title { font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .alert-msg { font-size: 13.5px; color: #475569; line-height: 1.6; margin: 0; }
    .grid { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }
    .grid td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .grid td.label { color: #64748b; font-weight: 600; width: 38%; }
    .grid td.val { color: #0f172a; font-family: monospace; font-weight: 700; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 12px; font-size: 13px; font-weight: 700; text-align: center; box-shadow: 0 2px 6px rgba(37,99,235,0.3); }
    .btn:hover { background: #1d4ed8; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; font-size: 11.5px; color: #64748b; text-align: center; line-height: 1.6; }
    .recipients-list { font-family: monospace; font-size: 11px; color: #334155; margin-top: 6px; word-break: break-all; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase;">INCLINOX GEOTECHNICAL MONITORING PLATFORM</div>
      <h1>⚠️ ${parameter} SAFETY THRESHOLD ALERT</h1>
      <span class="badge">${severity} BREACH DETECTED</span>
    </div>

    <div class="content">
      <div class="alert-box">
        <div class="alert-title">${title}</div>
        <p class="alert-msg">${message}</p>
      </div>

      <table class="grid">
        <tr>
          <td class="label">Device Name / ID</td>
          <td class="val">${deviceName} (${deviceId})</td>
        </tr>
        <tr>
          <td class="label">Monitored Parameter</td>
          <td class="val" style="color: ${accentColor};">${parameter}</td>
        </tr>
        ${alert.value !== undefined ? `
        <tr>
          <td class="label">Measured Breach Value</td>
          <td class="val" style="color: ${accentColor}; font-size: 14px;">${alert.value}</td>
        </tr>
        ` : ''}
        ${alert.threshold !== undefined ? `
        <tr>
          <td class="label">Safety Threshold Limit</td>
          <td class="val">${alert.threshold}</td>
        </tr>
        ` : ''}
        <tr>
          <td class="label">Incident Severity</td>
          <td class="val" style="color: ${accentColor}; font-weight: 800;">${severity}</td>
        </tr>
        <tr>
          <td class="label">Site / Structure</td>
          <td class="val">${siteName}</td>
        </tr>
        <tr>
          <td class="label">Timestamp (IST)</td>
          <td class="val">${timestamp}</td>
        </tr>
      </table>

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="${portalUrl}" class="btn">View Live Device Dashboard & Telemetry →</a>
      </div>
    </div>

    <div class="footer">
      <div>This automated geotechnical alert was dispatched to <strong>${cleanRecipients.length} configured recipient email(s)</strong>:</div>
      <div class="recipients-list">${cleanRecipients.join(', ')}</div>
      <div style="margin-top: 10px; font-size: 11px; color: #94a3b8;">
        Inclinox Automated Alert Engine • Tiltmeter & Subsurface Inclinometer Monitoring Platform
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const textContent = `
[INCLINOX ${severity} ${parameter} ALERT]
Device: ${deviceName} (${deviceId})
Parameter: ${parameter}
Title: ${title}
Message: ${message}
${alert.value !== undefined ? `Measured Value: ${alert.value}\n` : ''}${alert.threshold !== undefined ? `Threshold Limit: ${alert.threshold}\n` : ''}Severity: ${severity}
Site: ${siteName}
Timestamp (IST): ${timestamp}
Timestamp (UTC): ${utcTimestamp}
Live Dashboard: ${portalUrl}
Configured Recipients: ${cleanRecipients.join(', ')}
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
