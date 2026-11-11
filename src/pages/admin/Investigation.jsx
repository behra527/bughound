import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, FileSearch, FileText, FolderGit2, Lightbulb, ListTree, Shield } from 'lucide-react'
import Shell from '../../components/Shell'
import { AgentCards, StatusBadge, TicketBanner } from '../../components/ui'
import { useApp } from '../../context'

const nav = [
  ['Bug Report', FileText],
  ['Repository & Code', FolderGit2],
  ['Investigation Result', FileSearch],
  ['Root Cause Analysis', ListTree],
  ['Evidence (Code & Logs)', Shield],
  ['Recommendations', Lightbulb],
]

export default function Investigation() {
  const { id } = useParams()
  const { tickets } = useApp()
  const ticket = tickets.find((t) => t.id === id) || tickets[0]
  const [section, setSection] = useState('Investigation Result')
  const [tab, setTab] = useState('Investigation')

  return (
    <Shell title="Ticket Details – Investigation (Agent 1)" subtitle="View bug report, repository context, Investigator analysis, and root cause evidence.">
      <Link to="/admin/tickets" className="linkish"><ArrowLeft size={14} /> Back to tickets</Link>
      <TicketBanner ticket={ticket} />
      <div className="card" style={{ marginBottom: 14 }}><AgentCards active={2} /></div>
      <div className="tabs">
        {['Investigation', 'Validation', 'Patch (Diff)', 'Testing', 'GitHub Update', 'Activity Log'].map((name) => (
          <button key={name} className={tab === name ? 'on' : ''} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      {tab !== 'Investigation' ? <Other tab={tab} /> : (
        <div className="three">
          <div className="card"><div className="subnav">{nav.map(([name, Icon]) => <button key={name} className={section === name ? 'on' : ''} onClick={() => setSection(name)}><Icon size={14} /> {name}</button>)}</div></div>
          <div>{section === 'Bug Report' ? <Bug ticket={ticket} /> : section === 'Repository & Code' ? <Repo ticket={ticket} /> : section === 'Recommendations' ? <Recs /> : section === 'Evidence (Code & Logs)' ? <Evidence /> : section === 'Root Cause Analysis' ? <Cause /> : <Result ticket={ticket} />}</div>
          <div className="side-stack">
            <div className="card" style={{ background: '#f3fff6' }}>
              <div className="card-head"><h3>Investigation Result (Agent 1)</h3><span className="badge b-resolved">Completed</span></div>
              <p className="hint">The Investigator agent analyzed the relevant code, execution flow, and logs, and identified the likely cause of the issue.</p>
              <div className="card" style={{ background: '#f6f1ff' }}>
                <b>Root Cause (Identified)</b>
                <p className="hint">Incorrect credential validation logic due to password hashing mismatch. The login function compares the plain password with the hashed password stored in the database.</p>
              </div>
              <b>Confidence Score</b>
              <div className="progress"><i style={{ width: '93%' }} /></div>
              <div className="hint">0.93 (93%)</div>
            </div>
            <div className="card">
              <h3>Key Evidence</h3>
              {['File: app/auth/service.py', 'Function: authenticate_user()', 'Lines 42–49', 'Issue: Plain text password comparison.'].map((t) => <div className="checkline" key={t}><Check size={14} /> {t}</div>)}
            </div>
            <div className="card">
              <h3>Recommendations</h3>
              <div className="checkline"><Check size={14} /> Use bcrypt.verify() (or a similar hash verification method) to validate the password.</div>
              <div className="checkline"><Check size={14} /> Add a unit test to cover valid and invalid login cases.</div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Result({ ticket }) {
  return (
    <div className="card">
      <div className="two-col">
        <div>
          <h3>Ticket Information</h3>
          <div className="subnav">
            <button>Bug Report</button><button>Repository & Code</button><button className="on">Investigation Result</button>
          </div>
        </div>
        <div>
          <h3>Bug Report</h3>
          <div className="kv">
            <span>Customer</span><b>{ticket.customer}</b>
            <span>Repository</span><b>{ticket.repo}</b>
            <span>Branch</span><b>{ticket.branch}</b>
            <span>Commit</span><b>{ticket.commit}</b>
            <span>Bug Description</span><b>{ticket.description}</b>
            <span>Steps to Reproduce</span><b style={{ whiteSpace: 'pre-wrap' }}>{ticket.steps}</b>
          </div>
        </div>
      </div>
      <h3 style={{ marginTop: 12 }}>Relevant Code (from investigation)</h3>
      <div className="pair">
        <div>
          <div className="hint">app/auth/service.py · Problematic Code</div>
          <div className="light-code">
            {['42 def authenticate_user(email: str, password: str):', '43     user = db.query(User).filter(User.email == email).first()', '44     if not user:', '45         return None', '47     if user.password == password:  # Plain text comparison (bug)', '48         return user', '49     return None'].map((line, i) => (
              <div className={`ln ${line.includes('==') ? 'bad' : ''}`} key={line}><b>{42 + i}</b><span>{line}</span></div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Code Context</h3>
          <div className="kv">
            <span>File</span><b>app/auth/service.py</b>
            <span>Function</span><b>authenticate_user()</b>
            <span>Lines</span><b>42–49</b>
            <span>Issue</span><b>Plain text password comparison.</b>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12, background: '#f6f1ff' }}>
        <b>Investigator Summary</b>
        <p className="hint">The login failure is caused by a password verification mismatch. The system stores passwords using bcrypt hashing, but the current code is comparing the input password directly with the hashed value.</p>
      </div>
    </div>
  )
}

function Bug({ ticket }) {
  return <div className="card"><h3>Bug Report</h3><p>{ticket.description}</p><pre className="hint">{ticket.steps}</pre><StatusBadge status={ticket.status} /></div>
}
function Repo({ ticket }) {
  return <div className="card"><h3>Repository & Code</h3><p>{ticket.url}</p><p className="hint">Indexed commit {ticket.commit} on {ticket.branch}. Open the code explorer for the file tree.</p><Link to="/admin/repositories">Open Code Explorer</Link></div>
}
function Cause() {
  return <div className="card"><h3>Root Cause Analysis</h3><p>authenticate_user compares user.password with the raw input. Stored values are bcrypt hashes, so a correct password never matches.</p></div>
}
function Evidence() {
  return <div className="card"><h3>Evidence</h3><div className="code">INFO login failed user=valid@example.com reason=password mismatch<br />DEBUG compare plain == hash → False</div></div>
}
function Recs() {
  return <div className="card"><h3>Recommendations</h3><p>Replace the comparison with bcrypt.verify and add login unit tests.</p></div>
}
function Other({ tab }) {
  const map = {
    Validation: ['/admin/validation', 'Open the Validator report'],
    'Patch (Diff)': ['/admin/diff', 'Open the diff viewer'],
    Testing: ['/admin/testing', 'Open automated testing'],
    'GitHub Update': ['/admin/github', 'Open patch approval'],
    'Activity Log': ['/admin/agents', 'Open live execution logs'],
  }
  const [to, label] = map[tab]
  return <div className="card"><p className="hint">{label} for this ticket.</p><Link className="btn btn-primary" to={to}>{label}</Link></div>
}
