import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, Eye, Search, Ticket, XCircle } from 'lucide-react'
import Shell from '../../components/Shell'
import { LinePipeline, Pager, StatusBadge } from '../../components/ui'
import { useApp } from '../../context'

export default function MyTickets() {
  const { tickets } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All Status')
  const [sort, setSort] = useState('Newest First')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(tickets[0]?.id)

  const filtered = useMemo(() => {
    let list = tickets.filter((t) => {
      const q = query.toLowerCase()
      const hit = !q || t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.repo.toLowerCase().includes(q)
      const ok = status === 'All Status' || t.status === status
      return hit && ok
    })
    if (sort === 'Oldest First') list = [...list].reverse()
    return list
  }, [tickets, query, status, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / 6))
  const rows = filtered.slice((page - 1) * 6, page * 6)
  const current = tickets.find((t) => t.id === selected) || rows[0]

  const counts = {
    total: tickets.length,
    progress: tickets.filter((t) => t.status === 'In Progress' || t.status === 'Investigating').length,
    resolved: tickets.filter((t) => t.status === 'Resolved').length,
    rejected: tickets.filter((t) => t.status === 'Rejected').length,
  }

  return (
    <Shell title="My Tickets" subtitle="View and track all your bug reports, AI agents’ progress, and final resolution.">
      <div className="grid-4" style={{ marginBottom: 14 }}>
        {[[Ticket, 'purple', counts.total, 'Total Tickets'], [Clock3, 'amber', counts.progress, 'In Progress'], [CheckCircle2, 'green', counts.resolved, 'Resolved'], [XCircle, 'red', counts.rejected, 'Rejected']].map(([Icon, tone, value, label]) => (
          <div className={`stat ${tone}`} key={label}><div className="ico"><Icon size={18} /></div><div><b>{value}</b><span>{label}</span></div></div>
        ))}
      </div>
      <div className="split wide">
        <div className="card">
          <div className="filters">
            <label className="search"><Search size={16} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search by ticket ID, title, or repository..." /></label>
            <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              {['All Status', 'In Progress', 'Investigating', 'Resolved', 'Rejected'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="select"><option>All Time</option><option>Last 7 days</option><option>Last 30 days</option></select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option>Newest First</option><option>Oldest First</option>
            </select>
          </div>
          <table>
            <thead><tr><th>Ticket ID</th><th>Title</th><th>Repository</th><th>Status</th><th>Created At</th><th>Updated At</th><th>Action</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={`clickable ${current?.id === t.id ? 'selected' : ''}`} onClick={() => setSelected(t.id)}>
                  <td className="id-link">{t.id}</td>
                  <td>{t.title}</td>
                  <td><span className="repo-chip">{t.repo}</span></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.created}</td>
                  <td>{t.updated}</td>
                  <td><button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); navigate(`/customer/tickets/${t.id}`) }}><Eye size={14} /> View</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="empty">No tickets match these filters.</td></tr>}
            </tbody>
          </table>
          <Pager page={page} pages={pages} total={filtered.length} label="tickets" onPage={setPage} />
        </div>
        {current && (
          <div className="card">
            <div className="card-head">
              <h3>Ticket Details</h3>
              <button className="linkish" onClick={() => navigate(`/customer/tickets/${current.id}`)}>View Full Details →</button>
            </div>
            <div className="banner-top"><b style={{ color: '#7c3aed' }}>{current.id}</b> <b>{current.title}</b></div>
            <div className="meta">
              <span className="repo-chip">{current.repo}</span>
              <span className="repo-chip">{current.branch}</span>
              <StatusBadge status={current.status} />
            </div>
            <h3 style={{ marginTop: 16 }}>AI Agents Progress</h3>
            <LinePipeline active={current.status === 'Resolved' ? 5 : current.status === 'Investigating' ? 0 : 2} />
            <div className="card" style={{ background: '#f7f3ff', marginTop: 8 }}>
              <b>Current Activity</b>
              <p className="hint">Agent 3 is generating the code fix based on the validated root cause...</p>
            </div>
            <div className="kv" style={{ marginTop: 12 }}>
              <span>Created At</span><b>{current.created}</b>
              <span>Last Updated</span><b>{current.updated}</b>
              <span>Current Stage</span><b>{current.stage} ({current.agent})</b>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
