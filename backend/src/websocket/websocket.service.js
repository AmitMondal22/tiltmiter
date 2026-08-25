// WebSocket Live Telemetry Stream Broadcaster
const clients = new Set();

export function registerWebSocketHandler(fastify) {
  fastify.get('/ws/telemetry', { websocket: true }, (connection, req) => {
    const socket = connection.socket || connection;
    clients.add(socket);
    console.log('⚡ Client connected to Live Telemetry WebSocket stream. Active clients:', clients.size);

    try {
      socket.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to Tiltmeter 360 Live Telemetry WebSocket Server',
        timestamp: new Date().toISOString()
      }));
    } catch (e) {}

    socket.on('close', () => {
      clients.delete(socket);
      console.log('⚡ Client disconnected from WebSocket. Active clients:', clients.size);
    });

    socket.on('error', (err) => {
      console.warn('WebSocket client error:', err.message);
      clients.delete(socket);
    });
  });
}

export function broadcastTelemetry(data) {
  const payload = JSON.stringify({
    type: 'TELEMETRY_UPDATE',
    data,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    try {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    } catch (err) {
      clients.delete(client);
    }
  }
}
