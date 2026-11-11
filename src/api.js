const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, '')
const TOKEN_KEY = 'bughound-access-token'

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error(`Cannot reach BugHound API at ${API_BASE_URL}. Start the backend and check VITE_API_BASE_URL.`)
  }
  const result = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const detail = result?.detail
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${response.status})`)
  }
  return result
}

const statusLabels = {
  queued: 'Investigating',
  queued_worker: 'Investigating',
  pending_admin: 'Pending Admin Review',
  investigating: 'In Progress',
  validating: 'In Progress',
  patching: 'In Progress',
  testing: 'In Progress',
  awaiting_approval: 'Ready for Approval',
  rejected: 'Rejected',
  resolved: 'Resolved',
}

export function toUiTicket(ticket) {
  const created = ticket.created_at ? new Date(ticket.created_at).toLocaleString() : ''
  const updated = ticket.updated_at ? new Date(ticket.updated_at).toLocaleString() : created
  return {
    ...ticket,
    apiId: ticket.id,
    id: `T-${ticket.id}`,
    url: ticket.repository_url || '',
    repo: ticket.repository || 'Pending admin assignment',
    customer: ticket.customer_name,
    branch: ticket.fix_branch || ticket.base_branch || '—',
    commit: (ticket.base_commit_sha || '').slice(0, 7),
    status: statusLabels[ticket.status] || ticket.status.replaceAll('_', ' '),
    backend_status: ticket.status,
    stage: ticket.stage,
    created,
    updated,
    progress: ticket.status === 'resolved' ? 100 : ticket.status === 'awaiting_approval' ? 90 : ticket.status === 'testing' ? 75 : 25,
  }
}
