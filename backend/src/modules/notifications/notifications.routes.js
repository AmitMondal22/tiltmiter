import { NotificationGroup } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import {
  getActiveRecipientEmails,
  isValidEmail,
  sendTestEmail,
  verifySmtp,
  getSmtpCredentials,
  setMemoryRecipients,
  getMemoryRecipients
} from '../../services/emailService.js';

// In-memory fallback group if DB is running in fallback mode
const memoryGroup = {
  groupName: 'Emergency Geotechnical Alerts',
  channels: ['EMAIL'],
  recipients: getMemoryRecipients(),
  enabled: process.env.ALERT_AUTO_SEND_EMAIL !== 'false',
  async update(updates) {
    if (typeof updates.enabled === 'boolean') {
      this.enabled = updates.enabled;
    }
    if (Array.isArray(updates.recipients)) {
      this.recipients = updates.recipients;
      setMemoryRecipients(updates.recipients);
    }
    return this;
  }
};

export async function notificationsRoutes(fastify) {
  /**
   * Helper to fetch or create the default primary notification group.
   */
  async function getOrCreatePrimaryGroup() {
    try {
      let group = await NotificationGroup.findOne({
        where: { groupName: 'Emergency Geotechnical Alerts' },
      });

      if (!group) {
        const defaultRecipients = getMemoryRecipients();

        group = await NotificationGroup.create({
          groupName: 'Emergency Geotechnical Alerts',
          channels: ['EMAIL'],
          recipients: defaultRecipients,
          enabled: process.env.ALERT_AUTO_SEND_EMAIL !== 'false',
        });
      }

      return group;
    } catch (err) {
      memoryGroup.recipients = getMemoryRecipients();
      return memoryGroup;
    }
  }

  // 1. Get Notification Configuration & Multiple Recipients List
  fastify.get('/api/notifications/config', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const group = await getOrCreatePrimaryGroup();
      const activeEmails = await getActiveRecipientEmails();
      const smtpInfo = getSmtpCredentials();

      const smtpConfig = {
        host: smtpInfo.host,
        port: smtpInfo.port,
        secure: smtpInfo.secure,
        user: smtpInfo.user,
        from: smtpInfo.from,
        configured: smtpInfo.configured,
      };

      return reply.send({
        statusCode: 200,
        smtp: smtpConfig,
        autoSendEmail: group ? group.enabled : process.env.ALERT_AUTO_SEND_EMAIL !== 'false',
        recipients: activeEmails,
        primaryGroup: group,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to retrieve notification configuration',
        message: err.message,
      });
    }
  });

  // 2. Update Notification Configuration (Toggle Auto-send & Update Recipient List)
  fastify.post('/api/notifications/config', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { autoSendEmail, recipients } = req.body || {};
      const group = await getOrCreatePrimaryGroup();

      const updates = {};
      if (typeof autoSendEmail === 'boolean') {
        updates.enabled = autoSendEmail;
        process.env.ALERT_AUTO_SEND_EMAIL = String(autoSendEmail);
      }

      if (Array.isArray(recipients)) {
        const cleanList = Array.from(
          new Set(recipients.filter(isValidEmail).map(e => e.trim().toLowerCase()))
        );
        updates.recipients = cleanList;
        setMemoryRecipients(cleanList);
      }

      await group.update(updates);
      const activeEmails = await getActiveRecipientEmails();

      return reply.send({
        statusCode: 200,
        success: true,
        message: 'Notification configuration updated successfully',
        autoSendEmail: group.enabled,
        recipients: activeEmails,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to update notification configuration',
        message: err.message,
      });
    }
  });

  // 3. Add a Single Recipient Email to the Distribution List
  fastify.post('/api/notifications/recipients', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { email } = req.body || {};

      if (!email || !isValidEmail(email)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'A valid email address is required (e.g. user@example.com).',
        });
      }

      const normalized = email.trim().toLowerCase();
      const currentList = await getActiveRecipientEmails();

      if (!currentList.includes(normalized)) {
        currentList.push(normalized);
        setMemoryRecipients(currentList);
        const group = await getOrCreatePrimaryGroup();
        await group.update({ recipients: currentList });
      }

      const activeEmails = await getActiveRecipientEmails();

      return reply.send({
        statusCode: 200,
        success: true,
        message: `Recipient ${normalized} added successfully`,
        recipients: activeEmails,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to add recipient',
        message: err.message,
      });
    }
  });

  // 4. Remove a Recipient Email from the Distribution List
  fastify.delete('/api/notifications/recipients/:email', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { email } = req.params;
      const normalized = decodeURIComponent(email).trim().toLowerCase();

      const currentList = await getActiveRecipientEmails();
      const filtered = currentList.filter(e => e.toLowerCase() !== normalized);

      setMemoryRecipients(filtered);
      const group = await getOrCreatePrimaryGroup();
      await group.update({ recipients: filtered });

      const activeEmails = await getActiveRecipientEmails();

      return reply.send({
        statusCode: 200,
        success: true,
        message: `Recipient ${normalized} removed successfully`,
        recipients: activeEmails,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to remove recipient',
        message: err.message,
      });
    }
  });

  // 5. Send a Test Alert Email via SMTP
  fastify.post('/api/notifications/test-email', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { email } = req.body || {};
      const result = await sendTestEmail(email || null);

      if (!result.success) {
        return reply.status(400).send({
          statusCode: 400,
          success: false,
          error: 'Test email dispatch failed',
          message: result.error || 'Test email dispatch failed (check SMTP settings)',
          details: result,
        });
      }

      return reply.send({
        statusCode: 200,
        success: true,
        message: `Test alert email successfully sent to ${result.recipients.join(', ')}`,
        details: result,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Failed to send test email',
        message: err.message,
      });
    }
  });

  // 6. Test SMTP Server Connectivity
  fastify.get('/api/notifications/verify-smtp', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const result = await verifySmtp();
      return reply.send({
        statusCode: 200,
        verification: result,
      });
    } catch (err) {
      return reply.status(500).send({
        statusCode: 500,
        error: 'SMTP Verification Failed',
        message: err.message,
      });
    }
  });
}
