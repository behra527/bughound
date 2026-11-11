import { useEffect, useState } from 'react'
import { Eye, Plus, RefreshCw, Search, UserPlus } from 'lucide-react'
import Shell from '../../components/Shell'
import { Pager, StatusBadge } from '../../components/ui'
import { useApp } from '../../context'
import { apiRequest } from '../../api'

const sections = ['Integrations', 'AI / OpenRouter', 'GitHub', 'Access Control', 'General Settings', 'Audit Logs']

export default function Settings() {
  const { people, createCustomer, refreshCustomers, notify } = useApp()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [section, setSection] = useState('Integrations')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' })
  const [view, setView] = useState(null)
  const [integrations, setIntegrations] = useState(null)
  const [audit, setAudit] = useState([])

  useEffect(() => {
    apiRequest('/admin/integrations').then(setIntegrations).catch((error) => setIntegrations({ error: error.message }))
    apiRequest('/admin/audit').then(setAudit).catch(() => setAudit([]))
  }, [])

  const filtered = people.filter((p) => `${p.name} ${p.email} ${p.company}`.toLowerCase().includes(query.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 5))
  const rows = filtered.slice((page - 1) * 5, page * 5)

  const add = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email.includes('@') || form.password.length < 12) {
      notify('Name, valid email, and a password of at least 12 characters are required')
      return
    }
    try {
      await createCustomer(form)
      setForm({ name: '', company: '', email: '', password: '' })
      setShowAdd(false)
      notify('Customer account created')
    } catch (requestError) {
      notify(requestError.message)
    }
  }

  return (
    <Shell title="Customer Management & System Settings" subtitle="Manage customers, user accounts, and configure system integrations (OpenRouter, GitHub, etc.).">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div><h3><UserPlus size={16} /> Customer Management</h3><p className="hint">Create, view, update, and manage customer accounts and their projects/tickets.</p></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="search"><Search size={14} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search by name, email, or company..." /></label>
            <button className="btn btn-ghost" title="Refresh customers" onClick={() => refreshCustomers().catch((error) => notify(error.message))}><RefreshCw size={14} /></button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Customer</button>
          </div>
        </div>
        <div className="grid-4">
          <div className="stat purple"><div><b>{people.length}</b><span>Total Customers</span></div></div>
          <div className="stat green"><div><b>{people.filter((p) => p.status === 'Active').length}</b><span>Active</span></div></div>
          <div className="stat amber"><div><b>{people.filter((p) => p.status === 'Invited').length}</b><span>Invited</span></div></div>
          <div className="stat red"><div><b>{people.filter((p) => p.status === 'Blocked').length}</b><span>Blocked</span></div></div>
        </div>
        {showAdd && (
          <form onSubmit={add} className="two-col" style={{ marginTop: 12 }}>
            <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="password" minLength={12} placeholder="Initial password (12+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button className="btn btn-primary" type="submit">Create account</button>
          </form>
        )}
        <table>
          <thead><tr><th>#</th><th>Customer Name</th><th>Company</th><th>Email</th><th>Projects</th><th>Tickets</th><th>Joined At</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id}>
                <td>{(page - 1) * 5 + i + 1}</td>
                <td><b className="avatar sm" style={{ display: 'inline-grid', marginRight: 8 }}>{p.initials}</b>{p.name}</td>
                <td>{p.company}</td><td>{p.email}</td><td>{p.projects}</td><td>{p.tickets}</td><td>{p.joined}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>
                  <button className="icon-btn" onClick={() => setView(p)}><Eye size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={page} pages={pages} total={filtered.length} label="customers" onPage={setPage} />
        {view && <div className="info-box"><div><b>{view.name}</b><div>{view.email} · {view.company} · {view.status}</div></div><button className="btn btn-ghost" onClick={() => setView(null)}>Close</button></div>}
      </div>

      <div className="card">
        <h3>System Settings</h3>
        <p className="hint">Configure integrations, AI model settings, access control, and general system preferences.</p>
        <div className="split" style={{ gridTemplateColumns: '220px 1fr' }}>
          <div className="subnav">
            {sections.map((name) => <button key={name} className={section === name ? 'on' : ''} onClick={() => setSection(name)}>{name}</button>)}
          </div>
          <div>
            <div className="card-head"><h3>Integrations</h3><span className={`badge ${integrations?.error ? 'b-rejected' : 'b-progress'}`}>{integrations?.error || (integrations ? 'Live configuration status' : 'Loading status…')}</span></div>
            {(section === 'Integrations' || section === 'AI / OpenRouter' || section === 'GitHub') && (
              <div className="two-col">
                <div className="card">
                  <div className="card-head"><h3>OpenRouter (AI Agents)</h3><span className={`badge ${integrations?.openrouter_configured ? 'b-resolved' : 'b-rejected'}`}>{integrations?.openrouter_configured ? 'Configured' : 'Not configured'}</span></div>
                  <div className="field"><label>API Key</label><input type="password" disabled placeholder={integrations?.openrouter_configured ? 'Configured on backend' : 'Set OPENROUTER_API_KEY on backend'} /></div>
                  <div className="field"><label>API Base URL</label><input readOnly value="https://openrouter.ai/api/v1" /></div>
                  <div className="field"><label>Default Model</label><input readOnly value={integrations?.openrouter_model || 'Not configured'} /></div>
                  <p className="hint">Credentials are loaded by the backend and are never returned to the browser.</p>
                </div>
                <div className="card">
                  <div className="card-head"><h3>GitHub Integration</h3><span className={`badge ${integrations?.github_write_configured ? 'b-resolved' : 'b-progress'}`}>{integrations?.github_write_configured ? 'Write access configured' : 'Public read only'}</span></div>
                  <div className="field"><label>Write Token</label><input type="password" disabled placeholder={integrations?.github_write_configured ? 'Configured on backend' : 'Set GITHUB_TOKEN on backend'} /></div>
                  <div className="field"><label>Authorized Repositories</label><input readOnly value={integrations ? integrations.authorized_repository_count : 'Loading…'} /></div>
                  <p className="hint">Only public repositories explicitly listed in AUTHORIZED_REPOSITORIES can be analyzed or modified.</p>
                </div>
              </div>
            )}
            {section === 'Access Control' && <div className="card"><p>Only Admin creates customer accounts. Customers cannot self-register.</p></div>}
            {section === 'General Settings' && <div className="card"><p>Workflow configuration is managed through the backend environment. Automatic merge is disabled.</p></div>}
            {section === 'Audit Logs' && <div className="card">{audit.map((entry) => <p key={entry.id}><b>{entry.action.replaceAll('_', ' ')}</b><br /><span className="hint">Ticket {entry.ticket_id ?? 'system'} · {entry.created_at}</span></p>)}{!audit.length && <p className="hint">No audit events have been recorded.</p>}</div>}
            <div className="two-col" style={{ marginTop: 12 }}>
              <div className="card">
                <h3>Agent Workflow</h3>
                <p>Investigator, validator, and patch generation run sequentially after ticket intake. Test execution is delegated to the configured external runner.</p>
              </div>
              <div className="card">
                <h3>GitHub Safety</h3>
                <p>Pull requests are created only after admin approval and configured GitHub write authorization. The production branch is never modified directly; merges remain manual.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
