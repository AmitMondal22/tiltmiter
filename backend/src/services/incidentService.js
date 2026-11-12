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

// In-memory fallback tickets store
export let memoryTickets = [
  {
    id: 1,
    incidentCode: 'TKT-261101-101',
    deviceId: 'DEV-001',
    siteId: 'SITE-01',
    structureId: 'STRUCT-7939',
    organizationId: 1,
    title: 'Critical Tilt Threshold Exceeded: 2.450° on Node DEV-001',
    category: 'CRITICAL_ALERT',
    severity: 'CRITICAL',
    status: 'OPEN',
    source: 'AUTO_ALERT',
    assignedUserId: 3,
    assignedUserName: 'Sarah Jenkins (Site Engineer)',
    assignedUserEmail: 'sarah.j@techavo.in',
    createdByUserId: null,
    createdByUserName: 'System Alert Engine',
    acknowledgedAt: '2026-11-10T08:30:00.000Z',
    resolvedAt: null,
    closedAt: null,
    reopenedAt: null,
    rootCause: 'Automated tilt threshold breach detected by Alert Engine. Measured value: 2.450° (Critical Limit: 2.000°).',
    correctiveAction: null,
    siteRemarks: null,
    adminRemarks: null,
    resolutionImages: [],
    notes: [
      {
        id: 1,
        timestamp: '2026-11-10T08:25:00.000Z',
        author: 'System Alert Engine',
        role: 'SYSTEM',
        action: 'AUTO_CREATED',
        text: 'Automated critical alert triggered: Resultant tilt reached 2.450°, breaching the 2.000° safety threshold.',
      },
      {
        id: 2,
        timestamp: '2026-11-10T08:30:00.000Z',
        author: 'Admin Operator',
        role: 'SUPER_ADMIN',
        action: 'ASSIGNED',
        text: 'Assigned incident to Sarah Jenkins for urgent on-site geotechnical inspection.',
      }
    ],
    createdAt: '2026-11-10T08:25:00.000Z',
    updatedAt: '2026-11-10T08:30:00.000Z',
  },
  {
    id: 2,
    incidentCode: 'TKT-261102-204',
    deviceId: 'DEV-002',
    siteId: 'SITE-01',
    structureId: 'STRUCT-7939',
    organizationId: 1,
    title: 'Loose Mounting Bracket on Hill Slope Section B',
    category: 'STRUCTURAL_ANOMALY',
    severity: 'HIGH',
    status: 'RESOLVED',
    source: 'MANUAL',
    assignedUserId: 4,
    assignedUserName: 'Michael Chang (Field Tech)',
    assignedUserEmail: 'm.chang@techavo.in',
    createdByUserId: 1,
    createdByUserName: 'Admin Operator',
    acknowledgedAt: '2026-11-09T10:00:00.000Z',
    resolvedAt: '2026-11-09T14:45:00.000Z',
    closedAt: null,
    reopenedAt: null,
    rootCause: 'Ground subsidence near anchor plate caused bracket bolt loosening under cyclic thermal expansion.',
    correctiveAction: 'Re-torqued all anchor fasteners to 110 Nm, fitted thread-locking adhesive, and re-leveled mounting plate.',
    siteRemarks: 'Replaced upper clamp bolts with grade 8.8 hot-dip galvanized fasteners. Verified zero reference calibration at 0.004° pitch and 0.002° roll.',
    adminRemarks: null,
    resolutionImages: [
      '/uploads/device_image/device_DEV-002_sample.jpg'
    ],
    notes: [
      {
        id: 1,
        timestamp: '2026-11-09T09:15:00.000Z',
        author: 'Admin Operator',
        role: 'SUPER_ADMIN',
        action: 'CREATED',
        text: 'Manual ticket generated following visual survey of rock slope support assembly.',
      },
      {
        id: 2,
        timestamp: '2026-11-09T14:45:00.000Z',
        author: 'Michael Chang',
        role: 'SITE_USER',
        action: 'RESOLVED',
        text: 'Completed site repairs and uploaded verification photo. Awaiting admin review and ticket closure.',
      }
    ],
    createdAt: '2026-11-09T09:15:00.000Z',
    updatedAt: '2026-11-09T14:45:00.000Z',
  },
  {
    id: 3,
    incidentCode: 'TKT-261028-089',
    deviceId: 'DEV-003',
    siteId: 'SITE-02',
    structureId: null,
    organizationId: 1,
    title: 'Solar Panel Debris Cleaning & Battery Re-charge',
    category: 'MAINTENANCE',
    severity: 'MEDIUM',
    status: 'CLOSED',
    source: 'MANUAL',
    assignedUserId: 4,
    assignedUserName: 'Michael Chang (Field Tech)',
    assignedUserEmail: 'm.chang@techavo.in',
    createdByUserId: 1,
    createdByUserName: 'Admin Operator',
    acknowledgedAt: '2026-10-28T09:00:00.000Z',
    resolvedAt: '2026-10-28T11:30:00.000Z',
    closedAt: '2026-10-28T16:00:00.000Z',
    reopenedAt: null,
    rootCause: 'Heavy rainfall washed leaf debris over solar charging panel, causing low battery warnings.',
    correctiveAction: 'Cleaned solar glass, inspected gasket seals, and verified charging voltage at 4.18V.',
    siteRemarks: 'Panel wiped down, protective mesh installed above cell array to prevent future leaf buildup.',
    adminRemarks: 'Admin verified: telemetry shows continuous charging curve and battery restored to 100%. Ticket closed.',
    resolutionImages: [],
    notes: [
      {
        id: 1,
        timestamp: '2026-10-28T08:00:00.000Z',
        author: 'Admin Operator',
        role: 'SUPER_ADMIN',
        action: 'CREATED',
        text: 'Preventative maintenance ticket for node DEV-003.',
      },
      {
        id: 2,
        timestamp: '2026-10-28T11:30:00.000Z',
        author: 'Michael Chang',
        role: 'SITE_USER',
        action: 'RESOLVED',
        text: 'Cleaned solar glass and tested cell voltage.',
      },
      {
        id: 3,
        timestamp: '2026-10-28T16:00:00.000Z',
        author: 'Admin Operator',
        role: 'SUPER_ADMIN',
        action: 'CLOSED',
        text: 'Ticket confirmed and formally closed.',
      }
    ],
    createdAt: '2026-10-28T08:00:00.000Z',
    updatedAt: '2026-10-28T16:00:00.000Z',
  }
];

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

