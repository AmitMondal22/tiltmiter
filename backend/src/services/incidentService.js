import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Incident, Device, Site, Structure, User, Alarm } from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const ticketsUploadDir = path.join(uploadsDir, 'tickets');

if (!fs.existsSync(ticketsUploadDir)) {
  fs.mkdirSync(ticketsUploadDir, { recursive: true });
}

// In-memory tickets store (No static/dummy mock tickets)
export let memoryTickets = [];

let nextMemoryId = 100;

/**
 * Saves a base64 image data URL to disk permanently in /uploads/tickets/
 */
export function saveTicketImageToDisk(ticketCode, base64DataUrl) {
  if (!base64DataUrl || typeof base64DataUrl !== 'string') return null;
  if (!base64DataUrl.startsWith('data:image/')) return base64DataUrl;

  try {
    if (!fs.existsSync(ticketsUploadDir)) {
      fs.mkdirSync(ticketsUploadDir, { recursive: true });
    }

    const matches = base64DataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length < 3) return base64DataUrl;

    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';

    const cleanCode = (ticketCode || 'tkt').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `ticket_${cleanCode}_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.${ext}`;
    const filePath = path.join(ticketsUploadDir, filename);

    const buffer = Buffer.from(matches[2], 'base64');
    fs.writeFileSync(filePath, buffer);
    return `/uploads/tickets/${filename}`;
  } catch (err) {
    console.error('[TicketService] Error saving ticket image to disk:', err.message);
    return null;
  }
}

/**
 * Auto-creates a ticket when a CRITICAL or EMERGENCY alert occurs,
 * ensuring no duplicate active tickets exist for the same device.
 */
export async function createAutoAlertTicket({
  deviceId,
  siteId = null,
  structureId = null,
  organizationId = null,
  alarmId = null,
  title,
  severity = 'CRITICAL',
  message,
  parameter = 'tilt',
  value = null,
  threshold = null,
}) {
  try {
    // 1. Check if an active ticket already exists for this device
    let existingTicket = null;
    try {
      existingTicket = await Incident.findOne({
        where: {
          deviceId,
          status: ['OPEN', 'IN_PROGRESS', 'REOPENED', 'NEW'],
        },
      });
    } catch (_) {
      existingTicket = memoryTickets.find(
        t => t.deviceId === deviceId && ['OPEN', 'IN_PROGRESS', 'REOPENED', 'NEW'].includes(t.status)
      );
    }

    if (existingTicket) {
      // Append a note about repeated breach
      const noteEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        author: 'System Alert Engine',
        role: 'SYSTEM',
        action: 'BREACH_RECURRED',
        text: `Ongoing ${parameter.toUpperCase()} breach: ${value || ''} (Threshold: ${threshold || ''}).`,
      };

      try {
        const curNotes = Array.isArray(existingTicket.notes) ? existingTicket.notes : [];
        await existingTicket.update({
          notes: [...curNotes, noteEntry],
          updatedAt: new Date(),
        });
      } catch (_) {
        const idx = memoryTickets.findIndex(t => t.id === existingTicket.id);
        if (idx !== -1) {
          memoryTickets[idx].notes = [...(memoryTickets[idx].notes || []), noteEntry];
        }
      }
      return existingTicket;
    }

    // 2. Generate unique ticket code
    const ticketCode = `TKT-ALT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const newTicketData = {
      incidentCode: ticketCode,
      deviceId,
      siteId: siteId ? String(siteId) : null,
      structureId: structureId ? String(structureId) : null,
      organizationId: organizationId || null,
      alarmId: alarmId ? String(alarmId) : null,
      title: title || `Critical ${parameter.toUpperCase()} Alert on Device ${deviceId}`,
      category: 'CRITICAL_ALERT',
      severity: severity || 'CRITICAL',
      status: 'OPEN',
      source: 'AUTO_ALERT',
      assignedUserId: null,
      assignedUserName: null,
      createdByUserId: null,
      createdByUserName: 'System Alert Engine',
      rootCause: message || `Automated ${parameter} threshold breach detected by Alert Engine.`,
      correctiveAction: null,
      siteRemarks: null,
      adminRemarks: null,
      resolutionImages: [],
      notes: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          author: 'System Alert Engine',
          role: 'SYSTEM',
          action: 'AUTO_CREATED',
          text: `Auto-generated critical alert ticket: ${parameter.toUpperCase()} measured ${value || ''} (Limit: ${threshold || ''}). Immediate geotechnical assessment required.`,
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let created = null;
    try {
      created = await Incident.create(newTicketData);
    } catch (dbErr) {
      newTicketData.id = nextMemoryId++;
      created = newTicketData;
    }

    // Add to memory list
    const finalObj = created.toJSON ? created.toJSON() : created;
    memoryTickets.unshift(finalObj);
    console.log(`🎫 [TicketService] Auto-generated Incident Ticket ${ticketCode} for ${deviceId}`);
    return finalObj;
  } catch (err) {
    console.error('[TicketService] Error auto-generating ticket:', err.message);
    return null;
  }
}

/**
 * Automatically resolves active AUTO_ALERT tickets for a device
 * when all monitored telemetry parameters have returned to normal safe limits.
 */
export async function autoResolveTicketsForDevice(deviceId) {
  if (!deviceId) return;
  try {
    const autoRemarks = 'Auto-resolved: Monitored geotechnical telemetry (tilt & displacement) has returned to normal safe thresholds.';
    const nowIso = new Date().toISOString();

    // 1. Resolve in DB if available
    try {
      const activeTickets = await Incident.findAll({
        where: {
          deviceId,
          source: 'AUTO_ALERT',
          status: ['OPEN', 'IN_PROGRESS', 'REOPENED', 'NEW'],
        },
      });

      for (const t of activeTickets) {
        const curNotes = Array.isArray(t.notes) ? t.notes : [];
        const resolutionNote = {
          id: curNotes.length + 1,
          timestamp: nowIso,
          author: 'System Telemetry Monitor',
          role: 'SYSTEM',
          action: 'AUTO_RESOLVED',
          text: autoRemarks,
        };

        await t.update({
          status: 'RESOLVED',
          resolvedAt: new Date(),
          siteRemarks: t.siteRemarks ? `${t.siteRemarks}\n${autoRemarks}` : autoRemarks,
          notes: [...curNotes, resolutionNote],
          updatedAt: new Date(),
        });
        console.log(`✅ [TicketService] Auto-resolved DB ticket ${t.incidentCode} for device ${deviceId} (all normal)`);
      }
    } catch (_) {
      // Handled via memory fallback below
    }

    // 2. Resolve in memory store
    for (let i = 0; i < memoryTickets.length; i++) {
      const t = memoryTickets[i];
      if (
        t.deviceId === deviceId &&
        t.source === 'AUTO_ALERT' &&
        ['OPEN', 'IN_PROGRESS', 'REOPENED', 'NEW'].includes(t.status)
      ) {
        const curNotes = Array.isArray(t.notes) ? t.notes : [];
        const resolutionNote = {
          id: curNotes.length + 1,
          timestamp: nowIso,
          author: 'System Telemetry Monitor',
          role: 'SYSTEM',
          action: 'AUTO_RESOLVED',
          text: autoRemarks,
        };

        memoryTickets[i] = {
          ...t,
          status: 'RESOLVED',
          resolvedAt: nowIso,
          siteRemarks: t.siteRemarks ? `${t.siteRemarks}\n${autoRemarks}` : autoRemarks,
          notes: [...curNotes, resolutionNote],
          updatedAt: nowIso,
        };
        console.log(`✅ [TicketService] Auto-resolved memory ticket ${t.incidentCode} for device ${deviceId} (all normal)`);
      }
    }

    // 3. Also mark active alarm for device as RESOLVED
    try {
      await Alarm.update(
        { status: 'RESOLVED', updatedAt: new Date() },
        { where: { deviceId, status: 'ACTIVE' } }
      );
    } catch (_) {
      // Ignored
    }
  } catch (err) {
    console.error(`[TicketService] Error auto-resolving tickets for ${deviceId}:`, err.message);
  }
}

