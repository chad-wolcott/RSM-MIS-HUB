// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Authenticated API Client
//
// Wraps fetch() to include the Entra ID Bearer token from sessionStorage.
// All calls target /api/* which routes to the Azure Functions backend in
// production and to the local emulator (port 7071) during development via
// the Vite proxy configured in vite.config.js.
//
// Usage:
//   import { apiFetch } from './apiClient'
//   const users = await apiFetch('/api/users')
// ─────────────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_BASE || '/api'

function getAuthHeaders() {
  const token = sessionStorage.getItem('mih-access-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Authenticated fetch wrapper.
 *
 * @param {string} path     - Path under /api, e.g. '/api/users' or 'users'
 * @param {RequestInit} [options]
 * @returns {Promise<any>}  - Parsed JSON body
 * @throws {Error}          - On non-2xx response or network failure
 */
export async function apiFetch(path, options = {}) {
  const url = path.startsWith('/api') ? path : `${BASE}/${path.replace(/^\//, '')}`

  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  }

  const res = await fetch(url, { ...options, headers })

  if (res.status === 204) return null

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw Object.assign(
      new Error(body?.error || `API error ${res.status}`),
      { status: res.status, body }
    )
  }

  return body
}

// ── Convenience helpers ───────────────────────────────────────────────────────

export const apiGet    = (path, opts = {}) => apiFetch(path, { method: 'GET',    ...opts })
export const apiPost   = (path, data, opts = {}) => apiFetch(path, { method: 'POST',   body: JSON.stringify(data), ...opts })
export const apiPut    = (path, data, opts = {}) => apiFetch(path, { method: 'PUT',    body: JSON.stringify(data), ...opts })
export const apiDelete = (path, opts = {}) => apiFetch(path, { method: 'DELETE', ...opts })

// ── Resource clients ──────────────────────────────────────────────────────────

export const tenantsApi = {
  list:   ()         => apiGet('/api/tenants'),
  get:    (id)       => apiGet(`/api/tenants/${id}`),
  create: (data)     => apiPost('/api/tenants', data),
  update: (id, data) => apiPut(`/api/tenants/${id}`, data),
  remove: (id)       => apiDelete(`/api/tenants/${id}`),
}

export const usersApi = {
  list:   ()         => apiGet('/api/users'),
  get:    (id)       => apiGet(`/api/users/${id}`),
  create: (data)     => apiPost('/api/users', data),
  update: (id, data) => apiPut(`/api/users/${id}`, data),
  remove: (id)       => apiDelete(`/api/users/${id}`),
}

export const auditLogsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString()
    return apiGet(`/api/audit-logs${qs ? '?' + qs : ''}`)
  },
}

export const configApi = {
  getAll:      ()              => apiGet('/api/config'),
  getCategory: (category)     => apiGet(`/api/config/${category}`),
  update:      (category, data) => apiPut(`/api/config/${category}`, data),
}

export const healthApi = {
  check: () => apiGet('/api/health'),
}
