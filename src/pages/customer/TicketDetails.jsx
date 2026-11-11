import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Activity, ArrowLeft, Beaker, Code2, ExternalLink, FileText, GitPullRequest, LayoutGrid } from 'lucide-react'
import Shell from '../../components/Shell'
import { StatusBadge, TicketBanner } from '../../components/ui'
import { useApp } from '../../context'
import { apiRequest, toUiTicket } from '../../api'

const tabs = [
  ['Overview', LayoutGrid],
  ['Agent Results', Activity],
  ['Code Changes', Code2],
  ['Testing', Beaker],
  ['GitHub Update', GitPullRequest],
  ['Activity Log', FileText],
]

export default function TicketDetails() {
  const { id } = useParams()
  const { tickets, ticketsLoaded } = useApp()
  const [remoteTicket, setRemoteTicket] = useState(null)
  const [agentRuns, setAgentRuns] = useState([])
  const [tab, setTab] = useState('Overview')
  const ticket = tickets.find((item) => item.id === id) || remoteTicket

  useEffect(() => {
    const ticketId = id?.replace(/^T-/, '')
    if (!ticketId || !ticketsLoaded) return
    const listed = tickets.find((item) => item.id === id)
    const load = async () => {
      try {
        setRemoteTicket(listed || toUiTicket(await apiRequest(`/tickets/${ticketId}`)))
        setAgentRuns(await apiRequest(`/tickets/${ticketId}/agents`))
      } catch {
        setRemoteTicket(null)
      }
    }
    load()
  }, [id, ticketsLoaded, tickets])

  if (!ticketsLoaded || !ticket) {
    return <Shell title="Ticket Details"><div className="card"><p className="hint">{ticketsLoaded ? 'Ticket not found or you do not have access to it.' : 'Loading ticket…'}</p></div></Shell>
  }

  return (
    <Shell title="Ticket Details" subtitle="">
      <Link to="/customer/tickets" className="linkish" style={{ display: 'inline-flex', gap: 6, marginBottom: 8 }}><ArrowLeft size={14} /> Ticket Details</Link>
      <div className="split">
        <div>
          <TicketBanner ticket={ticket} />
          <div className="card">
            <div className="tabs">
              {tabs.map(([name, Icon]) => (
                <button key={name} className={tab === name ? 'on' : ''} onClick={() => setTab(name)}><Icon size={14} /> {name}</button>
              ))}
            </div>
            {tab === 'Overview' && <Overview ticket={ticket} />}
            {tab === 'Agent Results' && <AgentResults runs={agentRuns} ticket={ticket} />}
            {tab === 'Code Changes' && <CodeChanges ticket={ticket} />}
            {tab === 'Testing' && <Testing ticket={ticket} />}
            {tab === 'GitHub Update' && <Github ticket={ticket} />}
            {tab === 'Activity Log' && <Log ticket={ticket} runs={agentRuns} />}
          </div>
        </div>
        <aside className="side-stack">
          <div className="card">
            <h3>Ticket Information</h3>
            <div className="kv">
              <span>Ticket ID</span><b>{ticket.id}</b>
              <span>Status</span><StatusBadge status={ticket.status} />
              <span>Created At</span><b>{ticket.created}</b>
              <span>Last Updated</span><b>{ticket.updated}</b>
            </div>
          </div>
          <div className="card">
            <h3>Repository</h3>
            <a href={ticket.url} target="_blank" rel="noreferrer">{ticket.url}</a>
            <div className="meta"><span className="repo-chip">{ticket.branch}</span><span className="repo-chip">{ticket.commit}</span></div>
          </div>
          <div className="card"><h3>Progress</h3><div className="kv"><span>Workflow stage</span><b>{ticket.stage}</b><span>Test status</span><b>{ticket.test_status}</b><span>Verification</span><b>{ticket.verification_status}</b></div></div>
        </aside>
      </div>
    </Shell>
  )
}

function Overview({ ticket }) {
  return <div className="two-col">
    <div className="card"><h3>Ticket Description</h3><p>{ticket.description}</p><h3>Steps to Reproduce</h3><pre className="hint">{ticket.steps_to_reproduce || ticket.steps}</pre></div>
    <div className="card"><h3>Investigation Summary</h3><p>{ticket.investigation_report?.summary || 'Investigation has not completed.'}</p><h3>Validated Root Cause</h3><p>{ticket.validation_report?.root_cause || 'Root cause has not been validated.'}</p><h3>Current Stage</h3><p>{ticket.stage}</p></div>
  </div>
}

function AgentResults({ runs, ticket }) {
  return <div className="side-stack">
    <Report title="Agent 1 Investigation" data={ticket.investigation_report} />
    <Report title="Agent 2 Validation" data={ticket.validation_report} />
    {runs.map((run) => <Report key={run.id} title={run.agent_name} data={run.output_data || { error: run.error_message }} />)}
    {!runs.length && <p className="hint">No agent execution records have been returned yet.</p>}
  </div>
}

function Report({ title, data }) {
  return <div className="card"><h3>{title}</h3><pre className="code">{data ? JSON.stringify(data, null, 2) : 'Not available yet.'}</pre></div>
}

function CodeChanges({ ticket }) {
  return <div className="side-stack"><div className="card"><h3>Changed Source Files</h3>{(ticket.patch_files || []).map((file) => <div key={file.path} className="card"><h4>{file.path}</h4><pre className="code">{file.original}</pre><pre className="code">{file.content}</pre></div>)}{!ticket.patch_files?.length && <p className="hint">No generated patch is available yet.</p>}</div><div className="card"><h3>Unified Diff</h3><pre className="code">{ticket.patch_diff || 'No generated diff is available yet.'}</pre></div></div>
}

function Testing({ ticket }) {
  return <Report title={`Runner result: ${ticket.test_status}`} data={ticket.test_report} />
}

function Github({ ticket }) {
  return <div className="card"><h3>GitHub Pull Request</h3>{ticket.pr_url ? <a href={ticket.pr_url} target="_blank" rel="noreferrer">{ticket.pr_url} <ExternalLink size={14} /></a> : <p className="hint">No pull request has been created. Admin approval and GitHub write authorization are required.</p>}<div className="kv"><span>Fix branch</span><b>{ticket.fix_branch || 'Not created'}</b><span>Commit</span><b>{ticket.resulting_commit_sha || 'Not created'}</b><span>Verification</span><b>{ticket.verification_status}</b></div>{ticket.error_message && <p role="status" className="hint">{ticket.error_message}</p>}</div>
}

function Log({ ticket, runs }) {
  return <div className="timeline"><div className="tl"><div className="rail"><i className="purple" /></div><p><b>Ticket submitted</b><br /><small>{ticket.created}</small></p></div>{runs.map((run) => <div className="tl" key={run.id}><div className="rail"><i className={run.status === 'completed' || run.status === 'passed' ? 'green' : 'amber'} /><s /></div><p><b>{run.agent_name}: {run.status}</b><br /><small>{run.completed_at || run.started_at || ''} {run.error_message || ''}</small></p></div>)}</div>
}
