import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import Shell from '../../components/Shell'
import { StatusBadge, TicketBanner } from '../../components/ui'
import { useApp } from '../../context'

export default function PatchApproval() {
  const { tickets, ticketsLoaded, approveTicket, rejectTicket, notify } = useApp()
  const [selectedTicket, setSelectedTicket] = useState(null)
  const ticket = selectedTicket || tickets.find((item) => item.backend_status === 'awaiting_approval')
  const [tab, setTab] = useState('Patch Approval')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const approve = async () => {
    setBusy(true)
    setError('')
    try {
      setSelectedTicket(await approveTicket(ticket.apiId))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    setBusy(true)
    setError('')
    try {
      setSelectedTicket(await rejectTicket(ticket.apiId))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (!ticket) {
    return <Shell title="Patch Approval & GitHub Update" subtitle="Review only patches with a real passing CI result.">
      <div className="card"><h3>{ticketsLoaded ? 'No ticket is awaiting approval' : 'Loading tickets…'}</h3><p className="hint">Tickets appear here only after the external test runner reports a successful execution.</p></div>
    </Shell>
  }

  const files = ticket.patch_files || []
  const test = ticket.test_report

  return (
    <Shell title="Patch Approval & GitHub Update" subtitle="Review the generated patch and actual CI evidence before authorizing a pull request.">
      <TicketBanner ticket={ticket} extra={<StatusBadge status={ticket.status} />} />
      <div className="tabs">
        {['Patch Approval', 'GitHub Update', 'PR Details', 'Execution Logs', 'Final Verification'].map((name) => (
          <button key={name} className={tab === name ? 'on' : ''} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>

      <div className="grid-3">
        <div className="card">
          <h3>Patch Review Summary</h3>
          <div className="kv">
            <span>Ticket</span><b>{ticket.id}</b>
            <span>Repository</span><b>{ticket.repo}</b>
            <span>Base branch / commit</span><b>{ticket.base_branch} / {ticket.base_commit_sha}</b>
            <span>Changed files</span><b>{files.length}</b>
            <span>Runner status</span><b>{ticket.test_status}</b>
            <span>Runner URL</span>{test?.run_url ? <a href={test.run_url} target="_blank" rel="noreferrer">Open actual CI run <ExternalLink size={13} /></a> : <b>Not available</b>}
            <span>Ticket status</span><b>{ticket.backend_status}</b>
          </div>
        </div>
        <div className="card">
          <h3>Patch Changes</h3>
          {files.length ? files.map((file) => <div className="file-chip" key={file.path} style={{ marginBottom: 8 }}>{file.path}</div>) : <p className="hint">No patch artifact is available.</p>}
          <h3 style={{ marginTop: 12 }}>Investigation Report</h3>
          <pre className="hint">{JSON.stringify(ticket.investigation_report, null, 2) || 'No investigation report'}</pre>
          <h3 style={{ marginTop: 12 }}>Validation Report</h3>
          <pre className="hint">{JSON.stringify(ticket.validation_report, null, 2) || 'No validation report'}</pre>
        </div>
        <div className="card">
          <h3>Unified Diff</h3>
          <pre className="code" style={{ maxHeight: 420, overflow: 'auto' }}>{ticket.patch_diff || 'No generated diff is available.'}</pre>
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Actual Runner Result</h3>
          <div className="kv"><span>Status</span><b>{test?.status || 'not_run'}</b><span>Exit code</span><b>{test?.exit_code ?? 'not available'}</b><span>Summary</span><b>{test?.summary || 'No test summary returned'}</b></div>
          {test?.logs && <pre className="code" style={{ maxHeight: 180, overflow: 'auto' }}>{test.logs}</pre>}
        </div>
        <div className="card">
          <h3>GitHub Update</h3>
          <div className="kv"><span>Approval</span><b>{ticket.approval_by ? 'Approved' : ticket.backend_status === 'rejected' ? 'Rejected' : 'Pending'}</b><span>Fix branch</span><b>{ticket.fix_branch || 'Not created'}</b><span>Commit SHA</span><b>{ticket.resulting_commit_sha || 'Not created'}</b><span>Pull request</span>{ticket.pr_url ? <a href={ticket.pr_url} target="_blank" rel="noreferrer">Open pull request <ExternalLink size={13} /></a> : <b>Not created</b>}</div>
          <div className="info-box">Only an approved patch is written to a new branch. The default branch is never modified directly; merges remain with authorized repository maintainers.</div>
        </div>
        <div className="card">
          <h3>Approval Actions</h3>
          <button className="btn btn-primary btn-block" onClick={approve} disabled={busy || ticket.backend_status !== 'awaiting_approval'}>Approve & Create GitHub PR</button>
          <button className="btn btn-danger btn-block" style={{ marginTop: 8 }} onClick={reject} disabled={busy || ticket.backend_status !== 'awaiting_approval'}>Reject Patch</button>
          {error && <p role="alert" className="hint" style={{ color: '#dc2626' }}>{error}</p>}
          {ticket.error_message && <p className="hint" role="status">{ticket.error_message}</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div><h3>Final Verification</h3><p className="hint">Current state: {ticket.verification_status}. A ticket resolves only after the configured runner reports successful build and tests.</p></div>
          <div>
            {ticket.pr_url && <a className="btn btn-ghost" href={ticket.pr_url} target="_blank" rel="noreferrer">Open Pull Request <ExternalLink size={14} /></a>}
            <button className="btn btn-ghost" onClick={() => window.print()}>View Full Report</button>
          </div>
        </div>
      </div>
    </Shell>
  )
}
