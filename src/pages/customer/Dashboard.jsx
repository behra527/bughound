import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, Eye, Plus, Ticket, XCircle, Zap } from 'lucide-react'
import Shell from '../../components/Shell'
import { LinePipeline, StatusBadge } from '../../components/ui'
import { useApp } from '../../context'

export default function CustomerDashboard() {
  const { tickets } = useApp()
  const navigate = useNavigate()
  const mine = tickets.slice(0, 8)
  const ongoing = mine.find((t) => t.status === 'In Progress') || mine[0]
  const counts = {
    total: tickets.length,
    progress: tickets.filter((t) => t.status === 'In Progress' || t.status === 'Investigating').length,
    resolved: tickets.filter((t) => t.status === 'Resolved').length,
    rejected: tickets.filter((t) => t.status === 'Rejected').length,
  }

  return (
    <Shell title="Customer Dashboard" subtitle="Report bugs, track AI agents’ progress, and get your code fixed automatically.">
      <div className="welcome">
        <div>
          <h3>👋 Welcome Back, Customer!</h3>
          <span style={{ color: '#6d6784' }}>Here’s the summary of your bug tickets and their current status.</span>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/customer/create')}><Plus size={16} /> Create Bug Ticket</button>
      </div>
      <StatsRow counts={counts} />
      <div className="split" style={{ marginTop: 14 }}>
        {ongoing ? (
          <div className="card">
            <div className="card-head">
              <h3><Zap size={16} color="#7c3aed" /> {ongoing.backend_status === 'pending_admin' ? 'Ticket Awaiting Admin Setup' : `Ongoing Ticket (${ongoing.id})`}</h3>
              <button className="linkish" onClick={() => navigate(`/customer/tickets/${ongoing.id}`)}>View Details →</button>
            </div>
            <b>{ongoing.title}</b>
            <div className="meta">
              <span className="repo-chip">{ongoing.url}</span>
              <span className="repo-chip">{ongoing.branch} ({ongoing.commit})</span>
            </div>
            {ongoing.backend_status === 'pending_admin'
              ? <p className="hint">An administrator will connect an authorized repository and start the agents.</p>
              : <LinePipeline active={2} />}
          </div>
        ) : (
          <div className="card"><h3>No bug tickets yet</h3><p className="hint">Create a ticket to start an investigation.</p><button className="btn btn-primary" onClick={() => navigate('/customer/create')}><Plus size={14} /> Create Bug Ticket</button></div>
        )}
        <div className="side-stack">
          <div className="card">
            <h3><Zap size={16} color="#7c3aed" /> Quick Actions</h3>
            <button className="btn btn-soft btn-block" style={{ marginBottom: 8 }} onClick={() => navigate('/customer/create')}><Plus size={14} /> Create New Bug Ticket</button>
            <button className="btn btn-ghost btn-block" onClick={() => navigate('/customer/tickets')}>View My Tickets</button>
          </div>
          <div className="card">
            <h3>How It Works?</h3>
            <ol className="ol">
              {['Submit a bug report.', 'An administrator connects an authorized repository and starts the agents.', 'An administrator reviews and approves the verified patch.', 'The approved change is published through a GitHub pull request.'].map((text, i) => (
                <li key={text}><span className="num">{i + 1}</span>{text}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>Recent Tickets</h3>
          <button className="linkish" onClick={() => navigate('/customer/tickets')}>View All Tickets →</button>
        </div>
        <table>
          <thead><tr><th>Ticket ID</th><th>Title</th><th>Repository</th><th>Status</th><th>Updated At</th><th>Action</th></tr></thead>
          <tbody>
            {mine.slice(0, 3).map((t) => (
              <tr key={t.id}>
                <td><button className="id-link" onClick={() => navigate(`/customer/tickets/${t.id}`)}>{t.id}</button></td>
                <td>{t.title}</td>
                <td><span className="repo-chip">{t.repo}</span></td>
                <td><StatusBadge status={t.status} /></td>
                <td>{t.updated}</td>
                <td><button className="btn btn-ghost" onClick={() => navigate(`/customer/tickets/${t.id}`)}><Eye size={14} /> View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}

function StatsRow({ counts }) {
  const items = [
    [Ticket, 'purple', counts.total, 'Total Tickets'],
    [Clock3, 'amber', counts.progress, 'In Progress'],
    [CheckCircle2, 'green', counts.resolved, 'Resolved'],
    [XCircle, 'red', counts.rejected, 'Rejected'],
  ]
  return (
    <div className="grid-4">
      {items.map(([Icon, tone, value, label]) => (
        <div className={`stat ${tone}`} key={label}>
          <div className="ico"><Icon size={18} /></div>
          <div><b>{value}</b><span>{label}</span></div>
        </div>
      ))}
    </div>
  )
}
