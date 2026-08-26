import { Device } from '../models/index.js';

// WebSocket Live Telemetry Stream Broadcaster
const clients = new Set();
const latestTelemetryByDevice = new Map();
let lastTelemetry = null;

async function sendInitialData(socket, targetDeviceId) {
  try {
    // 1. If we have in-memory latest telemetry for target device or all devices, send immediately
    if (targetDeviceId && latestTelemetryByDevice.has(targetDeviceId)) {
      socket.send(JSON.stringify({
        type: 'TELEMETRY_UPDATE',
        data: latestTelemetryByDevice.get(targetDeviceId),
        timestamp: new Date().toISOString()
      }));
      return;
    }

    if (latestTelemetryByDevice.size > 0) {
      for (const [devId, devData] of latestTelemetryByDevice.entries()) {
        if (!targetDeviceId || targetDeviceId === devId) {
          socket.send(JSON.stringify({
            type: 'TELEMETRY_UPDATE',
            data: devData,
            timestamp: new Date().toISOString()
          }));
        }
      }
      return;
    }

    if (lastTelemetry) {
      socket.send(JSON.stringify({
        type: 'TELEMETRY_UPDATE',
        data: lastTelemetry,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // 2. Otherwise load last known device state from database for immediate fast data
    const devices = await Device.findAll({ limit: 10 });
    if (devices && devices.length > 0) {
      devices.forEach(dev => {
        const d = dev.toJSON();
        const payload = {
          deviceId: d.id,
          xTilt: d.xTilt ?? 0,
          yTilt: d.yTilt ?? 0,
          resultantTilt: d.resultantTilt ?? 0,
          xDisplacement: d.xDisplacement ?? 0,
          yDisplacement: d.yDisplacement ?? 0,
          totalDisplacement: d.totalDisplacement ?? 0,
          temp: d.temperature ?? 28.5,
          timestamp: d.lastSeen || new Date().toISOString(),
          status: d.status || 'ONLINE',
        };
        latestTelemetryByDevice.set(d.id, payload);
        if (!targetDeviceId || targetDeviceId === d.id) {
          try {
            socket.send(JSON.stringify({
              type: 'TELEMETRY_UPDATE',
              data: payload,
              timestamp: new Date().toISOString()
            }));
          } catch (e) {}
        }
      });
    }
  } catch (err) {
    // Database query fallback
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
  const devId = data.deviceId || data.id;
  if (devId) {
    latestTelemetryByDevice.set(devId, data);
  }
  lastTelemetry = data;

  const payload = JSON.stringify({
    type: 'TELEMETRY_UPDATE',
    data,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    try {
      if (client.readyState === 1) { // OPEN
        // If client specifically targeted a device, only send if matches
        if (!client.targetDeviceId || client.targetDeviceId === devId) {
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
