import { getWsUrl } from '../api/apiClient';
import { parseTelemetry } from '../utils/telemetryHelper';

class TelemetryManager {
  constructor() {
    this.socket = null;
    this.subscribers = new Map(); // id -> { callback, targetDeviceId }
    this.statusListeners = new Set();
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.baseDelay = 2000;
    this.isConnected = false;
    this.isConnecting = false;
    this.shouldStayConnected = false;
    this.latestByDevice = new Map();
    this.lastPacket = null;
    this.subIdCounter = 0;
  }

  // Subscribe to live telemetry packets with optional device filter
  // Automatically connects WebSocket on 1st subscriber, and disconnects when all subscribers leave
  subscribe(callback, targetDeviceId = null) {
    const id = ++this.subIdCounter;
    this.subscribers.set(id, { callback, targetDeviceId });

    // Auto-connect WebSocket when a telemetry page opens (first subscriber)
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }

    // Instantly provide cached telemetry if available for this device
    if (targetDeviceId && this.latestByDevice.has(targetDeviceId)) {
      try {
        callback(this.latestByDevice.get(targetDeviceId));
      } catch (e) {}
    } else if (!targetDeviceId && this.lastPacket) {
      try {
        callback(this.lastPacket);
      } catch (e) {}
    }

    // If already open, request fresh latest data
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.requestLatest(targetDeviceId);
    }

    // Return clean unsubscribe function
    return () => {
      this.subscribers.delete(id);

      // Auto-disconnect WebSocket when user navigates away from telemetry pages (0 subscribers)
      if (this.subscribers.size === 0) {
        console.log('🔌 Page changed / no telemetry subscribers: Closing WebSocket connection.');
        this.disconnect();
      }
    };
  }

  // Subscribe to connection status changes
  onStatusChange(callback) {
    this.statusListeners.add(callback);
    callback({ isConnected: this.isConnected, isConnecting: this.isConnecting });
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  notifyStatus() {
    const state = { isConnected: this.isConnected, isConnecting: this.isConnecting };
    this.statusListeners.forEach(cb => {
      try { cb(state); } catch (e) {}
    });
  }

  notifyData(data) {
    if (!data) return;
    const parsed = parseTelemetry(data);
    const devId = parsed.deviceId || parsed.id;

    if (devId) {
      this.latestByDevice.set(devId, parsed);
    }
    this.lastPacket = parsed;

    // Dispatch to subscribers matching deviceId or listening to ALL devices
    this.subscribers.forEach(({ callback, targetDeviceId }) => {
      if (!targetDeviceId || targetDeviceId === devId) {
        try {
          callback(parsed);
        } catch (e) {}
      }
    });
  }

  // Request latest data for a specific device or all devices
  requestLatest(deviceId = null) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({
          type: 'REQUEST_LATEST',
          deviceId
        }));
      } catch (e) {}
    }
  }

  connect() {
    this.shouldStayConnected = true;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    this.notifyStatus();

    try {
      const wsUrl = getWsUrl('/ws/telemetry');
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.notifyStatus();
        console.log('⚡ Telemetry WebSocket connected:', wsUrl);

        // Fast initial data request for any active subscribers
        this.subscribers.forEach(({ targetDeviceId }) => {
          this.requestLatest(targetDeviceId);
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'PING') {
            try {
              if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'PONG' }));
              }
            } catch (e) {}
            return;
          }
          if (msg.type === 'PONG') {
            return;
          }

          const liveData = msg.data || msg;
          if (liveData && (liveData.deviceId || liveData.id || liveData.tilt || liveData.displacement || liveData.xTilt)) {
            this.notifyData(liveData);
          }
        } catch (e) {}
      };

      this.socket.onerror = (err) => {
        console.warn('⚠️ Telemetry WebSocket connection offline or waiting for backend.');
      };

      this.socket.onclose = (event) => {
        this.isConnected = false;
        this.isConnecting = false;
        this.stopHeartbeat();
        this.notifyStatus();
        this.socket = null;

        // Only reconnect if we still have active page subscribers
        if (this.shouldStayConnected && this.subscribers.size > 0) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.isConnected = false;
      this.isConnecting = false;
      this.socket = null;
      this.notifyStatus();
      if (this.shouldStayConnected && this.subscribers.size > 0) {
        this.scheduleReconnect();
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.subscribers.size === 0) return;

    const delay = Math.min(this.baseDelay * Math.pow(1.4, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.shouldStayConnected && this.subscribers.size > 0) {
        this.connect();
      }
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'PING', timestamp: new Date().toISOString() }));
        }
      } catch (e) {}
    }, 25000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  disconnect() {
    this.shouldStayConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();

    if (this.socket) {
      if (this.socket.readyState === WebSocket.CONNECTING) {
        const s = this.socket;
        s.onopen = () => {
          try { s.close(); } catch (e) {}
        };
      } else if (this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.close();
        } catch (e) {}
      }
      this.socket = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.notifyStatus();
  }
}

export const telemetryService = new TelemetryManager();
export default telemetryService;
