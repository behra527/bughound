import { Check, ChevronRight, Code2, FlaskConical, Loader2, Search, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export function StatusBadge({ status }) {
  const map = {
    'In Progress': 'b-progress',
    Investigating: 'b-invest',
    Resolved: 'b-resolved',
    Rejected: 'b-rejected',
    'Ready for Approval': 'b-ready',
    Running: 'b-run',
    Completed: 'b-resolved',
    Pending: 'b-progress',
    Active: 'b-resolved',
    Blocked: 'b-rejected',
    Invited: 'b-progress',
  }
  return <span className={`badge ${map[status] || 'b-progress'}`}>{status}</span>
}

export function Stats({ items }) {
  return (
    <div className="grid-4">
      {items.map((item) => (
        <div className={`stat ${item.tone}`} key={item.label}>
          <div className="ico">{item.icon}</div>
          <div>
            <b>{item.value}</b>
            <span>{item.label}</span>
          </div>
          {item.delta && <em className={item.delta.startsWith('-') || item.delta.startsWith('↓') ? 'down' : 'up'}>{item.delta}</em>}
        </div>
      ))}
    </div>
  )
}

const icons = [Search, ShieldCheck, Code2, FlaskConical, Check]

export function LinePipeline({ active = 2 }) {
  const steps = [
    ['Agent 1', 'Investigator'],
    ['Agent 2', 'Validator'],
    ['Agent 3', 'Patch Generator'],
    ['Agent 4', 'Testing'],
    ['Resolution', 'Awaiting Approval'],
  ]
  return (
    <div className="pipeline">
      {steps.map(([name, role], i) => {
        const state = i < active ? 'done' : i === active ? 'run' : ''
        const Icon = icons[i] || Check
        return (
          <div className={`pipe-step ${state}`} key={name}>
            <div className="dot">{state === 'done' ? <Check size={16} /> : state === 'run' ? <Icon size={15} /> : <Icon size={15} />}</div>
            <b>{name}</b>
            <span>{role}</span>
            <div className="ok">{state === 'done' ? 'Completed' : state === 'run' ? 'In Progress' : 'Pending'}</div>
          </div>
        )
      })}
    </div>
  )
}

export function AgentCards({ active = 2, compact = false, complete = false }) {
  const agents = [
    ['Agent 1', 'Investigator', '1m 24s', Search],
    ['Agent 2', 'Validator', '1m 10s', ShieldCheck],
    ['Agent 3', 'Patch Generator', compact ? '44s' : '45s', Code2],
    ['Agent 4', 'Testing', '1m 32s', FlaskConical],
  ]
  return (
    <div className="agent-row">
      {agents.map(([name, role, time, Icon], i) => {
        const state = complete ? (i <= active ? 'done' : '') : i < active ? 'done' : i === active ? 'run' : ''
        return (
          <div key={name} style={{ display: 'contents' }}>
            <div className={`agent-card ${state}`}>
              <div className="big">{state === 'done' ? <Check size={16} color="#16a34a" /> : state === 'run' ? <Icon size={16} color="#7c3aed" /> : <Icon size={16} />}</div>
              <b>{name}</b>
              <span>{role}</span>
              <div className="ok" style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: state === 'done' ? '#16a34a' : state === 'run' ? '#7c3aed' : '#8a849f' }}>
                {state === 'done' ? `Completed (${time})` : state === 'run' ? `In Progress (${time})` : 'Pending'}
              </div>
            </div>
            {i < agents.length - 1 && <div className="arrow-gap"><ChevronRight size={16} /></div>}
          </div>
        )
      })}
    </div>
  )
}

export function TicketBanner({ ticket, extra }) {
  return (
    <div className="banner">
      <div className="banner-top">
        <b style={{ color: '#7c3aed' }}>{ticket.id}</b>
        <h3>{ticket.title}</h3>
        <StatusBadge status={ticket.status} />
        {extra}
      </div>
      <div className="meta">
        <span><Search size={13} /> {ticket.repo}</span>
        <span>⎇ {ticket.branch}</span>
        <span>&lt;/&gt; {ticket.commit}</span>
        <span>Created: {ticket.created}</span>
        <span>Updated: {ticket.updated}</span>
      </div>
    </div>
  )
}

export function Pager({ page, pages, total, label, onPage }) {
  return (
    <div className="pager">
      <span>Showing {(page - 1) * 6 + 1}–{Math.min(page * 6, total)} of {total} {label}</span>
      <div className="pages">
        <button onClick={() => onPage(Math.max(1, page - 1))}>&lt;</button>
        {Array.from({ length: pages }, (_, i) => (
          <button key={i} className={page === i + 1 ? 'on' : ''} onClick={() => onPage(i + 1)}>{i + 1}</button>
        ))}
        <button onClick={() => onPage(Math.min(pages, page + 1))}>&gt;</button>
      </div>
    </div>
  )
}

export function BackLink({ to, children }) {
  return <Link to={to} className="linkish" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>{children}</Link>
}

export function Spinner() {
  return <Loader2 size={16} className="spin" />
}
