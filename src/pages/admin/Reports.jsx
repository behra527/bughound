import { useEffect, useState } from 'react'
import Shell from '../../components/Shell'
import { useApp } from '../../context'
import { apiRequest } from '../../api'

export default function Reports() {
  const { tickets } = useApp()
  const [activities, setActivities] = useState([])
  useEffect(() => {
    apiRequest('/admin/audit').then(setActivities).catch(() => setActivities([]))
  }, [])
  const metrics = [
    [tickets.length, 'Tickets'],
    [tickets.filter((ticket) => ticket.status === 'Resolved').length, 'Resolved tickets'],
    [tickets.filter((ticket) => ticket.pr_url).length, 'Pull requests created'],
    [tickets.filter((ticket) => ticket.test_status !== 'not_run').length, 'Tickets with CI results'],
  ]
  const statuses = ['Investigating', 'In Progress', 'Ready for Approval', 'Resolved', 'Rejected']
  return (
    <Shell title="Reports & Analytics" subtitle="Counts and activity are derived from persisted tickets and audit events.">
      <div className="grid-4">
        {metrics.map(([value, label]) => (
          <div className="stat purple" key={label}><div><b>{value}</b><span>{label}</span></div></div>
        ))}
      </div>
      <div className="two-col" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Tickets by current status</h3>
          {statuses.map((status) => {
            const count = tickets.filter((ticket) => ticket.status === status).length
            const width = tickets.length ? `${count / tickets.length * 100}%` : '0%'
            return <div className="bar-row" key={status}><span>{status}</span><div className="hbar"><i style={{ width }} /></div><b>{count}</b></div>
          })}
        </div>
        <div className="card">
          <h3>Recent audit activity</h3>
          {activities.slice(0, 10).map((item) => <p key={item.id}><b>{item.action.replaceAll('_', ' ')}</b><br /><span className="hint">Ticket {item.ticket_id ?? 'system'} · {item.created_at}</span></p>)}
          {!activities.length && <p className="hint">No audit events have been recorded.</p>}
        </div>
      </div>
    </Shell>
  )
}
