const getApiBaseUrl = () => {
  const envVal = import.meta.env.VITE_API_BASE_URL;
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    return envVal;
  }
  // In production builds, use relative URL so all requests route seamlessly through Nginx proxy
  if (import.meta.env.PROD) {
    return '';
  }
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://127.0.0.1:8000';
};

const getWebrtcStreamBase = () => {
  const envVal = import.meta.env.VITE_WEBRTC_URL;
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    return envVal;
  }
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:8889`;
  }
  return 'http://127.0.0.1:8889';
};

export const API_BASE_URL = getApiBaseUrl();
export const WEBRTC_STREAM_BASE = getWebrtcStreamBase();

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('epic_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Session expired or invalid
    localStorage.removeItem('epic_token');
    localStorage.removeItem('epic_user');
    window.dispatchEvent(new Event('epic_auth_expired'));
  }

  return response;
}

export default {
  get: (endpoint) => apiRequest(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiRequest(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => apiRequest(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => apiRequest(endpoint, { method: 'DELETE' }),
  API_BASE_URL,
  WEBRTC_STREAM_BASE
};
