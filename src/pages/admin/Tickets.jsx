import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, Download, Eye, Play, Search, Ticket, X, XCircle } from 'lucide-react'
import Shell from '../../components/Shell'
import { LinePipeline, Pager, StatusBadge } from '../../components/ui'
import { useApp } from '../../context'

export default function AdminTickets() {
  const { tickets, rejectTicket, connectRepositoryAndStart, notify } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All Status')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState([])
  const [selected, setSelected] = useState('')
  const [panel, setPanel] = useState('Overview')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [startingAgents, setStartingAgents] = useState(false)

  const filtered = useMemo(() => tickets.filter((t) => {
    const q = query.toLowerCase()
    const hit = !q || [t.id, t.title, t.customer, t.repo].join(' ').toLowerCase().includes(q)
    return hit && (status === 'All Status' || t.status === status)
  }), [tickets, query, status])

  const pages = Math.max(1, Math.ceil(filtered.length / 8))
  const rows = filtered.slice((page - 1) * 8, page * 8)
  const current = tickets.find((t) => t.id === selected) || rows[0]
  const counts = [
    [Ticket, 'purple', tickets.length, 'Total Tickets'],
    [Clock3, 'amber', tickets.filter((ticket) => !['Resolved', 'Rejected'].includes(ticket.status)).length, 'In Progress'],
    [CheckCircle2, 'green', tickets.filter((ticket) => ticket.status === 'Resolved').length, 'Resolved'],
    [XCircle, 'red', tickets.filter((ticket) => ticket.status === 'Rejected').length, 'Rejected'],
  ]

  const toggle = (id) => setPicked((list) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const reject = async () => {
    try {
      await rejectTicket(current.apiId)
      notify(`${current.id} rejected`)
    } catch (error) {
      notify(error.message)
    }
  }

  const connectAndStart = async () => {
    setStartingAgents(true)
    try {
      await connectRepositoryAndStart(current.apiId, repositoryUrl)
      setRepositoryUrl('')
      notify('Repository connected; ticket queued for the agent worker')
    } catch (error) {
      notify(error.message)
    } finally {
      setStartingAgents(false)
    }
  }

  const exportCsv = () => {
    const header = 'id,title,customer,repository,status,stage\n'
    const body = filtered.map((t) => [t.id, t.title, t.customer, t.repo, t.status, t.stage].join(',')).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tickets.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Shell title="All Tickets Management" subtitle="View, search, filter, and manage all customer bug tickets across the system.">
      <div className="grid-4" style={{ marginBottom: 14 }}>
        {counts.map(([Icon, tone, value, label]) => (
          <div className={`stat ${tone}`} key={label}><div className="ico"><Icon size={18} /></div><div><b>{value}</b><span>{label}</span></div></div>
        ))}
      </div>
      <div className="split wide">
        <div className="card">
          <div className="filters">
            <label className="search"><Search size={16} /><input value={query} placeholder="Search by ticket ID, title, customer, or repository..." onChange={(e) => { setQuery(e.target.value); setPage(1) }} /></label>
            <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>{['All Status', 'Pending Admin Review', 'In Progress', 'Investigating', 'Ready for Approval', 'Resolved', 'Rejected'].map((s) => <option key={s}>{s}</option>)}</select>
            <select className="select"><option>All Agents</option><option>Agent 1</option><option>Agent 2</option><option>Agent 3</option><option>Agent 4</option></select>
            <select className="select"><option>All Customers</option><option>Ali Khan</option><option>Sara Ahmed</option></select>
            <select className="select"><option>All Time</option></select>
            <button className="btn btn-primary" onClick={exportCsv}><Download size={14} /> Export</button>
          </div>
          <table>
            <thead><tr><th></th><th>Ticket ID</th><th>Title</th><th>Customer</th><th>Repository</th><th>Status</th><th>Current Stage</th><th>Updated At</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={current?.id === t.id ? 'selected' : ''} onClick={() => setSelected(t.id)}>
                  <td><input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td className="id-link">{t.id}</td>
                  <td>{t.title}</td>
                  <td>{t.customer}</td>
                  <td><span className="repo-chip">{t.repo}</span></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.stage}</td>
                  <td>{t.updated}</td>
                  <td>
                    <button className="icon-btn" style={{ color: '#6d28d9' }} onClick={(e) => { e.stopPropagation(); navigate(`/admin/tickets/${t.id}`) }}><Eye size={16} /></button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="9" className="hint">No tickets have been submitted.</td></tr>}
            </tbody>
          </table>
          <Pager page={Math.min(page, pages)} pages={Math.min(pages, 5)} total={filtered.length} label="tickets" onPage={setPage} />
        </div>
        {current && (
          <div className="card">
            <div className="card-head"><h3>Ticket Details</h3><button className="linkish" onClick={() => navigate(`/admin/tickets/${current.id}`)}>Open Full Details</button></div>
            <div className="banner-top"><b style={{ color: '#7c3aed' }}>{current.id}</b> <b>{current.title}</b> <StatusBadge status={current.status} /></div>
            <div className="meta"><span className="repo-chip">{current.repo}</span><span className="repo-chip">{current.branch}</span><span className="repo-chip">{current.commit}</span></div>
            {current.backend_status === 'pending_admin' && (
              <div className="card" style={{ margin: '12px 0', background: '#f8f6ff' }}>
                <h3>Connect Repository and Start Agents</h3>
                <p className="hint">Use a public repository in the server AUTHORIZED_REPOSITORIES allowlist. This queues the workflow for the agent worker.</p>
                <div className="field"><label>Public GitHub Repository URL</label><input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/owner/repository" /></div>
                <button className="btn btn-primary" onClick={connectAndStart} disabled={startingAgents || !repositoryUrl.trim()}><Play size={14} /> {startingAgents ? 'Connecting…' : 'Connect Repository & Start Agents'}</button>
              </div>
            )}
            <div className="tabs">
              {['Overview', 'Agents', 'Code Changes', 'Testing', 'GitHub'].map((name) => (
                <button key={name} className={panel === name ? 'on' : ''} onClick={() => setPanel(name)}>{name}</button>
              ))}
            </div>
            {panel === 'Overview' && (
              <>
                <h3>AI Agent Workflow</h3>
                <LinePipeline active={current.status === 'Resolved' ? 5 : 2} />
                <div className="kv" style={{ marginTop: 10 }}>
                  <span>Bug Description</span><b>{current.description}</b>
                  <span>Root Cause</span><b>{current.validation_report?.root_cause || current.investigation_report?.suspected_root_cause || 'Not available yet'}</b>
                  <span>Proposed Fix</span><b>{current.investigation_report?.summary || 'Not available yet'}</b>
                </div>
              </>
            )}
            {panel === 'Agents' && <pre className="code">{JSON.stringify(current.investigation_report && current.validation_report ? { investigation: current.investigation_report, validation: current.validation_report } : { stage: current.stage }, null, 2)}</pre>}
            {panel === 'Code Changes' && <pre className="code">{current.patch_diff || 'No generated diff is available.'}</pre>}
            {panel === 'Testing' && <pre className="code">{JSON.stringify(current.test_report || { status: current.test_status }, null, 2)}</pre>}
            {panel === 'GitHub' && <div>{current.pr_url ? <a href={current.pr_url} target="_blank" rel="noreferrer">{current.pr_url}</a> : <p className="hint">No pull request has been created.</p>}</div>}
            <div className="actions-bar">
              <button className="btn btn-soft" onClick={() => navigate(`/admin/tickets/${current.id}`)}><Play size={14} /> Open Workflow</button>
              <button className="btn btn-primary" disabled={current.backend_status !== 'awaiting_approval'} onClick={() => navigate('/admin/github')}><CheckCircle2 size={14} /> Review Patch</button>
              <button className="btn btn-danger" disabled={current.backend_status !== 'awaiting_approval'} onClick={reject}><X size={14} /> Reject</button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
