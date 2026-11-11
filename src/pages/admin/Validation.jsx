import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Shield } from 'lucide-react'
import Shell from '../../components/Shell'
import { AgentCards, TicketBanner } from '../../components/ui'
import { useApp } from '../../context'

export default function Validation() {
  const { tickets } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Validation Report')
  const [section, setSection] = useState('Validation Summary')
  const ticket = tickets[0]

  return (
    <Shell title="Root Cause Validation Report (Agent 2)" subtitle="Review the Validator agent’s analysis, evidence, and root-cause verification results.">
      <TicketBanner ticket={ticket} />
      <div className="card" style={{ marginBottom: 14 }}><AgentCards active={1} complete /></div>
      <div className="tabs">
        {['Validation Report', 'Evidence', 'Code Analysis', 'Execution Logs', 'Comparison'].map((name) => (
          <button key={name} className={tab === name ? 'on' : ''} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      {tab !== 'Validation Report' ? <div className="card"><p className="hint">{tab} for Agent 2 is attached to commit {ticket.commit}. The validator result is confirmed with a confidence score of 0.95.</p></div> : (
        <div className="three" style={{ gridTemplateColumns: '220px 1fr 300px' }}>
          <div className="card">
            <div className="subnav">
              {['Validation Summary', 'Root Cause Confirmation', 'Evidence & Findings', 'Code Analysis', 'Impact Assessment', 'Recommendation'].map((name) => (
                <button key={name} className={section === name ? 'on' : ''} onClick={() => setSection(name)}>{name}</button>
              ))}
            </div>
          </div>
          <div className="card">
            {section === 'Validation Summary' && (
              <>
                <div className="card" style={{ background: '#ecfdf3' }}>
                  <div className="card-head"><h3><Shield size={16} color="#16a34a" /> Validation Summary (Agent 2)</h3><span className="badge b-resolved">Validated</span></div>
                  <p>The Validator agent has confirmed the root cause identified by the Investigator. The login failure is caused by an incorrect credential verification logic that compares the plain text password with the hashed password stored in the database.</p>
                  <div className="card" style={{ background: '#f6f1ff' }}>
                    <b>Root Cause (Verified)</b>
                    <p className="hint">Incorrect credential validation: the system directly compares the input password with the hashed password instead of using a hash verification function (e.g., bcrypt.verify).</p>
                  </div>
                </div>
                <h3>Code Evidence</h3>
                <div className="pair">
                  <div className="pane">
                    <h4>Problematic Code (Current)</h4>
                    <div className="hint">app/auth/service.py (line 43–45)</div>
                    <div className="light-code">
                      <div className="ln bad"><b>43</b><span>if user.password == password:</span></div>
                      <div className="ln bad"><b>44</b><span>return user</span></div>
                      <div className="ln"><b>45</b><span>return None</span></div>
                    </div>
                  </div>
                  <div className="pane">
                    <h4>Correct Approach (Expected)</h4>
                    <div className="light-code">
                      <div className="ln good"><b>43</b><span>if verify_password(password,</span></div>
                      <div className="ln good"><b>44</b><span>user.password_hash):</span></div>
                      <div className="ln good"><b>45</b><span>return user</span></div>
                    </div>
                  </div>
                </div>
              </>
            )}
            {section !== 'Validation Summary' && <p>{section}: the validator agrees with Agent 1. Severity is high because valid users cannot sign in.</p>}
            <div className="two-col" style={{ marginTop: 12 }}>
              <div className="card" style={{ background: '#fff7ed' }}>
                <h3>Impact Assessment</h3>
                <p><b>Severity: High</b> · Type: Authentication</p>
                <p className="hint">Users with correct credentials cannot log in, which blocks the core functionality of the application.</p>
              </div>
              <div className="card">
                <h3>Agent 2 Recommendation</h3>
                <ul>
                  <li>Use bcrypt.verify() to validate the password.</li>
                  <li>Add unit tests for valid and invalid login cases.</li>
                  <li>Ensure the password is always stored in hashed form.</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="side-stack">
            <div className="card">
              <h3>Validation Result</h3>
              <div className="kv">
                <span>Investigator Root Cause</span><b>Matched</b>
                <span>Validation Status</span><b>Confirmed</b>
                <span>Confidence Score</span><b>0.95 (95%)</b>
                <span>Consistency Check</span><b>Passed</b>
                <span>False Positive Check</span><b>Passed</b>
              </div>
              <div className="progress"><i style={{ width: '95%' }} /></div>
            </div>
            <div className="card">
              <h3>Key Evidence</h3>
              {['Login function compares plain text with hashed value.', 'Password is stored using bcrypt hashing in the database.', 'No hash verification (e.g., bcrypt.verify) is used.', 'Execution logs show password mismatch for valid input.'].map((t) => <div className="checkline" key={t}><Check size={14} /> {t}</div>)}
            </div>
            <div className="card">
              <h3>Next Action</h3>
              <button className="btn btn-primary btn-block" onClick={() => navigate('/admin/diff')}>Run Agent 3 – Generate Patch</button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => window.print()}>View Full Report</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
