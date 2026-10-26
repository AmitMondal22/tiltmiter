import { Device, TelemetryRecord } from '../models/index.js';
import pkg from 'sequelize';
const { Op } = pkg;

// WebSocket Live Telemetry Stream Broadcaster
const clients = new Set();
const latestTelemetryByDevice = new Map();

async function sendInitialData(socket, targetDeviceId) {
  if (!targetDeviceId) return;
  const cleanTargetId = targetDeviceId.toString().trim();
  const lowerTarget = cleanTargetId.toLowerCase();

  try {
    // 1. Check in-memory cache for this EXACT device (case-insensitive)
    for (const [key, devData] of latestTelemetryByDevice.entries()) {
      if (key && key.toLowerCase() === lowerTarget) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({
            type: 'TELEMETRY_UPDATE',
            data: devData,
            timestamp: new Date().toISOString()
          }));
        }
        return;
      }
    }

    // 2. Query latest telemetry record for this EXACT device from PostgreSQL
    const latestRec = await TelemetryRecord.findOne({
      where: {
        [Op.or]: [
          { deviceId: cleanTargetId },
          { deviceId: cleanTargetId.toUpperCase() },
          { deviceId: cleanTargetId.toLowerCase() }
        ]
      },
      order: [['timestamp', 'DESC']],
    });

    if (latestRec) {
      const rec = latestRec.toJSON ? latestRec.toJSON() : latestRec;
      const payload = {
        deviceId: rec.deviceId,
        xTilt: rec.xTilt ?? 0,
        yTilt: rec.yTilt ?? 0,
        zTilt: rec.zTilt ?? 0,
        resultantTilt: rec.resultantTilt ?? 0,
        xDisplacement: rec.xDisplacement ?? 0,
        yDisplacement: rec.yDisplacement ?? 0,
        totalDisplacement: rec.totalDisplacement ?? 0,
        temperature: rec.temperature !== null && rec.temperature !== undefined ? `${rec.temperature} °C` : '--',
        temp: rec.temperature ?? null,
        timestamp: rec.timestamp,
        status: 'ONLINE',
        rawPayload: rec.rawPayload || {}
      };
      latestTelemetryByDevice.set(rec.deviceId, payload);
      latestTelemetryByDevice.set(rec.deviceId.toLowerCase(), payload);
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'TELEMETRY_UPDATE',
          data: payload,
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }

    // 3. If device has no telemetry records in database yet, do NOT send fake telemetry
    return;
  } catch (err) {
    console.warn(`[WebSocket] sendInitialData error for ${cleanTargetId}:`, err.message);
  }
}

function handleClientConnection(connection, req) {
  const socket = connection.socket || connection;
  let targetDeviceId = req.params?.deviceId || req.query?.deviceId || null;
  if (!targetDeviceId && req.url) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      targetDeviceId = urlObj.searchParams.get('deviceId') || null;
    } catch (e) {}
  }

  socket.targetDeviceId = targetDeviceId;
  clients.add(socket);
  console.log(`⚡ Client connected to Live Telemetry WebSocket stream (Device: ${targetDeviceId || 'ALL'}). Active clients:`, clients.size);

  try {
    socket.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'Connected to Tiltmeter 360 Live Telemetry WebSocket Server',
      deviceId: targetDeviceId || 'ALL',
      timestamp: new Date().toISOString()
    }));
  } catch (e) {}

  // Instantly send latest data to client on fast first connect
  sendInitialData(socket, targetDeviceId);

  socket.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'PING') {
        socket.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      } else if (parsed.type === 'SUBSCRIBE' || parsed.type === 'SUBSCRIBE_DEVICE') {
        socket.targetDeviceId = parsed.deviceId || null;
        sendInitialData(socket, socket.targetDeviceId);
      } else if (parsed.type === 'REQUEST_LATEST') {
        sendInitialData(socket, parsed.deviceId || socket.targetDeviceId);
      }
    } catch (e) {}
  });

  socket.on('close', () => {
    clients.delete(socket);
    console.log('⚡ Client disconnected from WebSocket. Active clients:', clients.size);
  });

  socket.on('error', (err) => {
    console.warn('WebSocket client error:', err.message);
    clients.delete(socket);
  });
}

export function registerWebSocketHandler(fastify) {
  // Support standard, query-string and path-parameter routing paths
  fastify.get('/ws/telemetry', { websocket: true }, handleClientConnection);
  fastify.get('/ws/telemetry/:deviceId', { websocket: true }, handleClientConnection);
  fastify.get('/api/ws/telemetry', { websocket: true }, handleClientConnection);
  fastify.get('/api/ws/telemetry/:deviceId', { websocket: true }, handleClientConnection);
  fastify.get('/ws/:deviceId', { websocket: true }, handleClientConnection);
  fastify.get('/ws', { websocket: true }, handleClientConnection);

  // Keepalive heartbeat ping every 25 seconds
  setInterval(() => {
    const pingPayload = JSON.stringify({ type: 'PING', timestamp: new Date().toISOString() });
    for (const client of clients) {
      try {
        if (client.readyState === 1) { // OPEN
          client.send(pingPayload);
        } else if (client.readyState === 2 || client.readyState === 3) {
          clients.delete(client);
        }
      } catch (err) {
        clients.delete(client);
      }
    }
  }, 25000);
}

export function broadcastTelemetry(data) {
  if (!data) return;
  const devId = (data.deviceId || data.id || '').toString().trim();
  const lowerDevId = devId.toLowerCase();
  if (devId) {
    latestTelemetryByDevice.set(devId, data);
    latestTelemetryByDevice.set(lowerDevId, data);
  }

  const payload = JSON.stringify({
    type: 'TELEMETRY_UPDATE',
    data,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    try {
      if (client.readyState === 1) { // OPEN
        const clientTarget = (client.targetDeviceId || '').toString().trim().toLowerCase();
        // If client specifically targeted a device, only send if matches exactly
        if (!clientTarget || clientTarget === lowerDevId) {
          client.send(payload);
        }
      } else if (client.readyState === 2 || client.readyState === 3) {
        clients.delete(client);
      }
    } catch (err) {
      clients.delete(client);
    }
  }
}

export function broadcastAlarm(alarm) {
  if (!alarm) return;
  const payload = JSON.stringify({
    type: 'ALARM_TRIGGERED',
    data: alarm,
    timestamp: new Date().toISOString(),
  });

  for (const client of clients) {
    try {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      } else if (client.readyState === 2 || client.readyState === 3) {
        clients.delete(client);
      }
    } catch (err) {
      clients.delete(client);
    }
  }
}

