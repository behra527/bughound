import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, Eye, FlaskConical, GitPullRequest, Play, Plus, Search, Ticket, UserPlus, XCircle, Zap } from 'lucide-react'
import Shell from '../../components/Shell'
import { StatusBadge } from '../../components/ui'
import { useApp } from '../../context'
import { apiRequest } from '../../api'

export default function AdminDashboard() {
  const { tickets, ticketsLoaded } = useApp()
  const navigate = useNavigate()
  const [activities, setActivities] = useState([])
  const total = tickets.length
  const resolved = tickets.filter((ticket) => ticket.status === 'Resolved').length
  const rejected = tickets.filter((ticket) => ticket.status === 'Rejected').length
  const inProgress = tickets.filter((ticket) => !['Resolved', 'Rejected'].includes(ticket.status)).length
  const live = tickets.filter((ticket) => ['Investigating', 'In Progress'].includes(ticket.status)).slice(0, 5)
  const testsRun = tickets.filter((ticket) => ticket.test_status !== 'not_run').length
  const prsCreated = tickets.filter((ticket) => ticket.pr_url).length

  useEffect(() => {
    apiRequest('/admin/audit').then(setActivities).catch(() => setActivities([]))
  }, [])

  return (
    <Shell title="Admin Dashboard" subtitle="Monitor bug tickets, AI agents, approvals, and GitHub updates across all customers.">
      <div className="grid-4">
        {[
          [Ticket, 'purple', total, 'Total Tickets'],
          [Clock3, 'amber', inProgress, 'In Progress'],
          [CheckCircle2, 'green', resolved, 'Resolved'],
          [XCircle, 'red', rejected, 'Rejected'],
        ].map(([Icon, tone, value, label, delta]) => (
          <div className={`stat ${tone}`} key={label}>
            <div className="ico"><Icon size={18} /></div>
            <div><b>{value}</b><span>{label}</span></div>
          </div>
        ))}
      </div>

      <div className="split" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h3><Zap size={16} color="#7c3aed" /> AI Agent Executions (Live)</h3><button className="linkish" onClick={() => navigate('/admin/agents')}>View All Executions →</button></div>
          <table>
            <thead><tr><th>Ticket</th><th>Repository</th><th>Current Stage</th><th>Progress</th></tr></thead>
            <tbody>
              {live.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => navigate(`/admin/tickets/${row.id}`)}>
                  <td className="id-link">{row.id}</td>
                  <td><span className="repo-chip">{row.repo}</span></td>
                  <td>{row.stage}</td>
                  <td style={{ minWidth: 140 }}><div className="progress"><i style={{ width: `${row.progress}%` }} /></div><span className="hint">{row.progress}%</span></td>
                </tr>
              ))}
              {!live.length && <tr><td colSpan="4" className="hint">{ticketsLoaded ? 'No tickets are currently running.' : 'Loading tickets…'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Ticket Status Overview</h3>
          <div className="donut-wrap">
            <div className="donut"><span>{total}<small>Tickets</small></span></div>
            <div className="legend">
              <div><i className="sw" style={{ background: '#22c55e' }} /> Resolved {resolved}</div>
              <div><i className="sw" style={{ background: '#8b5cf6' }} /> In progress {inProgress}</div>
              <div><i className="sw" style={{ background: '#ef4444' }} /> Rejected {rejected}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="split" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h3>Recent Tickets</h3><button className="linkish" onClick={() => navigate('/admin/tickets')}>View All Tickets →</button></div>
          <table>
            <thead><tr><th>Ticket ID</th><th>Title</th><th>Customer</th><th>Repository</th><th>Status</th><th>Updated At</th><th>Action</th></tr></thead>
            <tbody>
              {tickets.slice(0, 5).map((t) => (
                <tr key={t.id}>
                  <td className="id-link">{t.id}</td><td>{t.title}</td><td>{t.customer}</td>
                  <td><span className="repo-chip">{t.repo}</span></td>
                  <td><StatusBadge status={t.status} /></td><td>{t.updated}</td>
                  <td><button className="btn btn-ghost" onClick={() => navigate(`/admin/tickets/${t.id}`)}><Eye size={14} /> View</button></td>
                </tr>
              ))}
              {!tickets.length && <tr><td colSpan="7" className="hint">{ticketsLoaded ? 'No tickets have been submitted.' : 'Loading tickets…'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="side-stack">
          <div className="card">
            <h3><Zap size={16} color="#7c3aed" /> Quick Actions</h3>
            <div className="two-col">
              <button className="btn btn-ghost" onClick={() => navigate('/admin/customers')}><UserPlus size={14} /> Add Customer</button>
              <button className="btn btn-ghost" onClick={() => navigate('/admin/tickets')}><Plus size={14} /> View Tickets</button>
              <button className="btn btn-ghost" onClick={() => navigate('/admin/agents')}><Play size={14} /> View Agent Runs</button>
              <button className="btn btn-ghost" onClick={() => navigate('/admin/github')}><GitPullRequest size={14} /> View GitHub Updates</button>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Recent Activity</h3><button className="linkish" onClick={() => navigate('/admin/reports')}>View All →</button></div>
            <div className="timeline">
              {activities.slice(0, 6).map((item) => (
                <div className="tl" key={item.id}>
                  <div className="rail"><i className="purple" /><s /></div>
                  <p>{item.action.replaceAll('_', ' ')} · {item.details?.repository || ''}<br /><small>{item.created_at}</small></p>
                </div>
              ))}
              {!activities.length && <p className="hint">No audit events have been recorded.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>System Overview</h3>
        <div className="grid-3">
          <div className="stat purple"><div className="ico"><Zap size={16} /></div><div><b>4</b><span>AI Agents<br />Investigator, Validator, Patch Generator, Testing</span></div></div>
          <div className="stat" style={{ background: '#eef6ff' }}><div className="ico"><GitPullRequest size={16} /></div><div><b>{prsCreated}</b><span>Pull Requests Created</span></div></div>
          <div className="stat green"><div className="ico"><FlaskConical size={16} /></div><div><b>{testsRun}</b><span>Tickets with a CI test result</span></div></div>
        </div>
      </div>
    </Shell>
  )
}
