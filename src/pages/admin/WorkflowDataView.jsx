import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Shell from '../../components/Shell'
import { TicketBanner } from '../../components/ui'
import { useApp } from '../../context'
import { apiRequest } from '../../api'

const headings = {
  investigation: ['Ticket Investigation', 'Investigation report and evidence collected from the authorized repository.'],
  validation: ['Root Cause Validation', 'Independent validation report, assumptions, and counterevidence.'],
  patch: ['Patch Diff', 'Original and corrected source files generated for this ticket.'],
  testing: ['Automated Testing', 'Actual results returned by the configured external CI runner.'],
  agents: ['Agent Execution', 'Persisted agent run status, inputs, outputs, and errors.'],
  repository: ['Repository Explorer', 'Repository tree, recent commits, and evidence files at the inspected commit.'],
}

export default function WorkflowDataView({ view }) {
  const { id } = useParams()
  const { tickets, ticketsLoaded } = useApp()
  const [runs, setRuns] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const ticket = (id && tickets.find((item) => item.id === id)) || tickets[0]
  const [title, subtitle] = headings[view]

  useEffect(() => {
    if (!ticket?.apiId) return
    let cancelled = false
    const load = async () => {
      try {
        const [agentRuns, repository] = await Promise.all([
          apiRequest(`/tickets/${ticket.apiId}/agents`),
          apiRequest(`/tickets/${ticket.apiId}/repository`).catch((requestError) => ({ error: requestError.message })),
        ])
        if (cancelled) return
        setRuns(agentRuns)
        setSnapshot(repository?.error ? null : repository)
        setError(repository?.error || '')
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      }
    }
    load()
    return () => { cancelled = true }
  }, [ticket?.apiId])

  if (!ticketsLoaded || !ticket) {
    return <Shell title={title} subtitle={subtitle}><div className="card"><p className="hint">{ticketsLoaded ? 'No ticket is available.' : 'Loading tickets…'}</p></div></Shell>
  }

  const selectedFile = snapshot?.files?.find((file) => file.path === selectedPath) || snapshot?.files?.[0]
  const repositoryPaths = snapshot?.paths || []

  return (
    <Shell title={title} subtitle={subtitle}>
      <TicketBanner ticket={ticket} />
      {error && <div className="banner" role="status">{error}</div>}
      {view === 'investigation' && <div className="two-col"><div className="card"><h3>Bug Report</h3><p>{ticket.description}</p><h4>Steps to reproduce</h4><pre className="code">{ticket.steps_to_reproduce || ticket.steps}</pre></div><Report title="Agent 1 Report" data={ticket.investigation_report} /></div>}
      {view === 'validation' && <Report title="Agent 2 Report" data={ticket.validation_report} />}
      {view === 'patch' && <div className="side-stack"><div className="card"><h3>Changed Source</h3>{(ticket.patch_files || []).map((file) => <details key={file.path} className="file-chip"><summary>{file.path}</summary><div className="two-col"><pre className="code">{file.original}</pre><pre className="code">{file.content}</pre></div></details>)}{!ticket.patch_files?.length && <p className="hint">No patch has been generated.</p>}</div><div className="card"><h3>Unified Diff</h3><pre className="code">{ticket.patch_diff || 'No patch has been generated.'}</pre></div></div>}
      {view === 'testing' && <div className="side-stack"><div className="card"><h3>Runner status: {ticket.test_status}</h3><Report title="Actual Runner Result" data={ticket.test_report} /></div><div className="card"><h3>Post-PR Verification: {ticket.verification_status}</h3>{ticket.error_message && <p role="status">{ticket.error_message}</p>}</div></div>}
      {view === 'agents' && <div className="side-stack">{runs.map((run) => <Report key={run.id} title={`${run.agent_name} · ${run.status}`} data={run.output_data || { error: run.error_message }} />)}{!runs.length && <div className="card"><p className="hint">No agent runs have been recorded yet.</p></div>}</div>}
      {view === 'repository' && <div className="two-col"><div className="card"><div className="card-head"><h3>Repository Files at {ticket.base_commit_sha || 'pending inspection'}</h3><span>{repositoryPaths.length} paths</span></div><div className="tree">{repositoryPaths.map((path) => <button key={path} className={selectedPath === path ? 'on' : ''} onClick={() => setSelectedPath(path)}>{path}</button>)}</div></div><div className="side-stack"><div className="card"><h3>{selectedFile?.path || 'Evidence source files'}</h3><pre className="code">{selectedFile?.content || 'Agent 1 selected source evidence after repository inspection.'}</pre></div><div className="card"><h3>Recent Commits</h3>{(snapshot?.commits || []).map((commit) => <div className="file-chip" key={commit.sha}><b>{commit.sha?.slice(0, 10)}</b> {commit.message}</div>)}{!snapshot?.commits?.length && <p className="hint">Commit history is not available yet.</p>}</div></div></div>}
    </Shell>
  )
}

function Report({ title, data }) {
  return <div className="card"><h3>{title}</h3><pre className="code">{data ? JSON.stringify(data, null, 2) : 'Not available yet.'}</pre></div>
}
