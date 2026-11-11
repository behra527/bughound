import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../../components/Shell'
import { TicketBanner } from '../../components/ui'
import { useApp } from '../../context'

export default function Testing() {
  const { tickets } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Testing Results')
  const ticket = tickets[0]
  const report = ticket?.test_report

  if (!ticket) {
    return <Shell title="Automated Testing & Results (Agent 4)"><div className="card"><h3>No ticket selected</h3><p className="hint">Testing results appear after the external CI runner executes a ticket patch.</p></div></Shell>
  }

  return (
    <Shell title="Automated Testing & Results (Agent 4)" subtitle="Results are reported by the configured external CI runner; repository code is never executed by the API host.">
      <TicketBanner ticket={ticket} />
      <div className="tabs">
        {['Testing Results', 'Test Execution Logs', 'Test Cases', 'Coverage', 'Verification Summary'].map((name) => (
          <button key={name} className={tab === name ? 'on' : ''} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      {(tab === 'Testing Results' || tab === 'Verification Summary') && (
        <>
          <div className="grid-3">
            <div className="card">
              <h3>Testing Summary</h3>
              <div className="kv">
                <span>Overall Result</span><b>{report?.status || ticket.test_status || 'not_run'}</b>
                <span>Exit code</span><b>{report?.exit_code ?? 'not available'}</b>
                <span>Runner run</span>{report?.run_url ? <a href={report.run_url} target="_blank" rel="noreferrer">Open CI result</a> : <b>Not available</b>}
                <span>Summary</span><b>{report?.summary || 'No runner result has been recorded.'}</b>
              </div>
            </div>
            <div className="card">
              <h3>Runner State</h3>
              <p>{ticket.backend_status}</p>
              <p className="hint">No test pass, coverage, or case count is shown unless the configured runner returned it.</p>
            </div>
            <div className="card">
              <h3>Verification</h3>
              <div className="kv"><span>Post-PR verification</span><b>{ticket.verification_status}</b><span>Error</span><b>{ticket.error_message || 'None reported'}</b></div>
            </div>
          </div>
          <div className="grid-3" style={{ marginTop: 14 }}>
            <div className="card"><h3>Verification Result</h3><b>{ticket.verification_status}</b><p className="hint">No deployment or health-check result is inferred from patch tests.</p></div>
            <div className="card"><h3>Agent 4 Output</h3><pre className="code">{JSON.stringify(report, null, 2) || 'No test execution has been recorded.'}</pre></div>
            <div className="card">
              <h3>Next Action</h3>
              <button className="btn btn-primary btn-block" disabled={ticket.backend_status !== 'awaiting_approval'} onClick={() => navigate('/admin/github')}>Review for Approval</button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => window.print()}>View Full Report</button>
            </div>
          </div>
        </>
      )}
      {tab === 'Test Execution Logs' && <div className="card"><pre className="code">{report?.logs || 'No runner logs have been recorded.'}</pre></div>}
      {tab === 'Test Cases' && <div className="card"><pre className="code">{JSON.stringify(report?.cases || [], null, 2)}</pre></div>}
      {tab === 'Coverage' && <div className="card"><h3>Coverage</h3><p>{report?.coverage ?? 'Not reported by the configured runner.'}</p></div>}
    </Shell>
  )
}
