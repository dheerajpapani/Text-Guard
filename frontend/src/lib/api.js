const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088').replace(/\/$/, '');
const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || 'default';
const WORKSPACE_KEY = import.meta.env.VITE_WORKSPACE_KEY || '';

function workspaceHeaders(extraHeaders = {}) {
  return {
    ...extraHeaders,
    'X-Workspace-Id': WORKSPACE_ID,
    ...(WORKSPACE_KEY ? { 'X-Workspace-Key': WORKSPACE_KEY } : {}),
  };
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: workspaceHeaders(options.headers || {}),
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      return { error: payload.detail || 'Request failed' };
    }
    return payload;
  } catch (error) {
    console.error('API request error:', error);
    return { error: 'Network error' };
  }
}

export async function callModerationAPI(text, mode = 'comment') {
  const payload = await request('/moderate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mode }),
  });
  if (payload.error) {
    return {
      action: 'review',
      reason: payload.error,
      flags: ['server_error'],
      categories: {},
    };
  }
  return payload;
}

export async function fetchAdminLogs({ action = '', limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (action) params.set('action', action);
  params.set('limit', String(limit));
  return request(`/admin/logs?${params.toString()}`, { method: 'GET' });
}

export async function saveReviewSubmission(payload) {
  return request('/admin/review-submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function applyReviewDecision(eventId, payload) {
  return request(`/admin/logs/${eventId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function assignReviewOwner(eventId, payload) {
  return request(`/admin/logs/${eventId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchAnalytics(limit = 500) {
  return request(`/admin/analytics?limit=${encodeURIComponent(String(limit))}`, { method: 'GET' });
}

export async function fetchTestCases(limit = 100) {
  return request(`/admin/test-cases?limit=${encodeURIComponent(String(limit))}`, { method: 'GET' });
}

export async function saveTestCase(payload) {
  return request('/admin/test-cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function exportTestCases() {
  return request('/admin/test-cases/export', { method: 'GET' });
}

export async function importTestCases(payload) {
  return request('/admin/test-cases/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchPolicyPresets() {
  return request('/admin/policy-presets', { method: 'GET' });
}

export async function savePolicyPreset(payload) {
  return request('/admin/policy-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export { API_BASE_URL, WORKSPACE_ID };
