const envApiUrl = import.meta.env?.VITE_API_BASE_URL;
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const hostname = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
const isDevLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const port = isDevLocal ? '5001' : (typeof window !== 'undefined' && window.location.port ? window.location.port : '');
export const API_BASE_URL = envApiUrl 
  ? (envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl) 
  : `${protocol}//${hostname}${port ? `:${port}` : ''}/api`;

export const getWsUrl = (path = '/ws/telemetry') => {
  if (import.meta.env?.VITE_WS_URL) {
    const wsEnv = import.meta.env.VITE_WS_URL.trim();
    return wsEnv.endsWith('/') ? wsEnv.slice(0, -1) : wsEnv;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // If API_BASE_URL is defined, derive WS url directly from it
  if (API_BASE_URL && (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://'))) {
    try {
      const parsed = new URL(API_BASE_URL);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}${cleanPath}`;
    } catch (e) {}
  }

  const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const portPart = isDevLocal ? ':5001' : (window.location.port && window.location.port !== '80' && window.location.port !== '443' ? `:${window.location.port}` : '');
  return `${wsProtocol}//${hostname}${portPart}${cleanPath}`;
};

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// Automatic Refresh Token Handler
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('tiltmeter_refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await response.json();
  if (!response.ok || !data.accessToken) {
    localStorage.removeItem('tiltmeter_jwt_token');
    localStorage.removeItem('tiltmeter_refresh_token');
    localStorage.removeItem('tiltmeter_user');
    window.location.reload();
    throw new Error(data.message || 'Session expired. Please log in again.');
  }

  localStorage.setItem('tiltmeter_jwt_token', data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem('tiltmeter_refresh_token', data.refreshToken);
  }
  return data.accessToken;
}

// Universal HTTP Request Helper with JWT & Refresh Token interceptor
async function request(endpoint, options = {}, isRetry = false) {
  const token = localStorage.getItem('tiltmeter_jwt_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 Token Expiration with Automatic Refresh Retry
    if (response.status === 401 && !isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const newAccessToken = await refreshAccessToken();
          isRefreshing = false;
          onRefreshed(newAccessToken);
          return await request(endpoint, options, true);
        } catch (err) {
          isRefreshing = false;
          throw err;
        }
      } else {
        return new Promise((resolve) => {
          subscribeTokenRefresh(async (newToken) => {
            options.headers = { ...options.headers, Authorization: `Bearer ${newToken}` };
            resolve(await request(endpoint, options, true));
          });
        });
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `API Request failed with status ${response.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      console.warn(`[API] Connection refused / network offline to ${API_BASE_URL}${endpoint}`);
      return { ok: false, error: err.message, devices: [], history: [] };
    }
    throw err;
  }
}

// Authentication API
export async function loginUser(username, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (res.accessToken || res.token) {
    localStorage.setItem('tiltmeter_jwt_token', res.accessToken || res.token);
  }
  if (res.refreshToken) {
    localStorage.setItem('tiltmeter_refresh_token', res.refreshToken);
  }
  if (res.user) {
    localStorage.setItem('tiltmeter_user', JSON.stringify(res.user));
  }
  return res;
}

export async function registerUser(userData) {
  const res = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
  if (res.accessToken || res.token) {
    localStorage.setItem('tiltmeter_jwt_token', res.accessToken || res.token);
  }
  if (res.refreshToken) {
    localStorage.setItem('tiltmeter_refresh_token', res.refreshToken);
  }
  if (res.user) {
    localStorage.setItem('tiltmeter_user', JSON.stringify(res.user));
  }
  return res;
}

export async function refreshSession() {
  return await refreshAccessToken();
}

export async function getUserProfile() {
  return await request('/auth/profile');
}

// Multi-tenant Hierarchy APIs
export async function getOrganizations() {
  return await request('/organizations');
}

export async function createOrganization(data) {
  return await request('/organizations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOrganization(id, data) {
  return await request(`/organizations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteOrganization(id) {
  return await request(`/organizations/${id}`, {
    method: 'DELETE',
  });
}

// Projects API
export async function getProjects() {
  return await request('/projects');
}

export async function createProject(data) {
  return await request('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id, data) {
  return await request(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id) {
  return await request(`/projects/${id}`, {
    method: 'DELETE',
  });
}

// Sites & Locations API
export async function getSites() {
  return await request('/sites');
}

export async function createSite(data) {
  return await request('/sites', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSite(id, data) {
  return await request(`/sites/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSite(id) {
  return await request(`/sites/${id}`, {
    method: 'DELETE',
  });
}

// Structures & Assets / Barriers API
export async function getStructures() {
  return await request('/structures');
}

export async function createStructure(data) {
  return await request('/structures', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStructure(id, data) {
  return await request(`/structures/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteStructure(id) {
  return await request(`/structures/${id}`, {
    method: 'DELETE',
  });
}

// Devices Inventory API
export async function getDevices() {
  return await request('/devices');
}

export async function createDevice(data) {
  return await request('/devices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDevice(id, data) {
  return await request(`/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDevice(id) {
  return await request(`/devices/${id}`, {
    method: 'DELETE',
  });
}

export async function configureDeviceTelemetry(id, config) {
  return await request(`/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// Historical Telemetry API
export async function getDeviceTelemetry(deviceId, fromDate, toDate) {
  let query = `/telemetry/${deviceId}`;
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  if (params.toString()) query += `?${params.toString()}`;
  return await request(query);
}

export async function getTelemetryHistory(deviceId, fromDate, toDate) {
  return await getDeviceTelemetry(deviceId, fromDate, toDate);
}

// Project-wise, Site-wise, Device-wise Reports & Analytics API
export async function getReportsAnalytics(filters = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.append('organizationId', filters.organizationId);
  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.siteId) params.append('siteId', filters.siteId);
  if (filters.deviceId) params.append('deviceId', filters.deviceId);
  if (filters.fromDate) params.append('fromDate', filters.fromDate);
  if (filters.toDate) params.append('toDate', filters.toDate);
  const query = params.toString() ? `/reports/analytics?${params.toString()}` : '/reports/analytics';
  return await request(query);
}

// Alarms API
export async function getAlarms() {
  return await request('/alarms');
}

// Users Management API
export async function getUsers() {
  return await request('/users');
}

export async function createUser(data) {
  return await request('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(id, data) {
  return await request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id) {
  return await request(`/users/${id}`, {
    method: 'DELETE',
  });
}
