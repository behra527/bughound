import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CheckCircle2, FileText, Zap } from 'lucide-react'
import Shell from '../../components/Shell'
import { useApp } from '../../context'

const empty = { title: '', description: '', steps: '' }

export default function CreateTicket() {
  const { addTicket } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const review = () => {
    if (!form.title.trim() || !form.description.trim() || !form.steps.trim()) {
      setError('Title, description, and steps to reproduce are required.')
      return
    }
    setError('')
    setStep(2)
  }

  const submit = async () => {
    try {
      const ticket = await addTicket({
        title: form.title,
        description: form.description,
        steps: form.steps,
      })
      setCreated(ticket)
      setError('')
      setStep(3)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <Shell title="Create Bug Ticket" subtitle="Register the bug report. An administrator connects the authorized repository and starts the investigation.">
      <div className="split wide">
        <div className="card">
          <div className="steps">
            {['Bug Details', 'Review', 'Submitted'].map((label, i) => (
              <div key={label} style={{ display: 'contents' }}>
                <div className={`step-pill ${step === i + 1 ? 'on' : ''} ${step > i + 1 ? 'done' : ''}`}><span className="n">{step > i + 1 ? <Check size={12} /> : i + 1}</span>{label}</div>
                {i < 2 && <div className={`step-line ${step > i + 1 ? 'on' : ''}`} />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <>
              <h3><FileText size={16} /> Bug Details</h3>
              <div className="field">
                <label>Bug Title <span className="req">*</span></label>
                <input value={form.title} onChange={set('title')} placeholder="Login fails on valid credentials" />
              </div>
              <div className="field">
                <label>Bug Description <span className="req">*</span></label>
                <textarea rows={4} maxLength={1000} value={form.description} onChange={set('description')} placeholder="Describe what happens and when it started." />
                <div className="count">{form.description.length} / 1000</div>
              </div>
              <div className="field">
                <label>Steps to Reproduce <span className="req">*</span></label>
                <textarea rows={5} maxLength={2000} value={form.steps} onChange={set('steps')} placeholder={'1. Open the application.\n2. Go to the login page.'} />
                <div className="count">{form.steps.length} / 2000</div>
              </div>
              {error && <p className="hint" style={{ color: '#dc2626' }}>{error}</p>}
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => navigate('/customer')}>Cancel</button>
                <button className="btn btn-primary" onClick={review}>Review Ticket →</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h3>Review Ticket</h3>
              <div className="kv">
                <span>Repository</span><b>An administrator will connect it after ticket review.</b>
                <span>Title</span><b>{form.title}</b>
                <span>Description</span><b>{form.description}</b>
                <span>Steps</span><b style={{ whiteSpace: 'pre-wrap' }}>{form.steps}</b>
              </div>
              {error && <p className="hint" role="alert" style={{ color: '#dc2626' }}>{error}</p>}
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-primary" onClick={submit}>Submit Ticket</button>
              </div>
            </>
          )}

          {step === 3 && created && (
            <div style={{ textAlign: 'center', padding: '24px 10px' }}>
              <CheckCircle2 size={48} color="#16a34a" />
              <h3 style={{ justifyContent: 'center' }}>Ticket {created.id} submitted</h3>
              <p className="hint">Your ticket is waiting for an administrator to connect an authorized repository and start the agents.</p>
              <button className="btn btn-primary" onClick={() => navigate(`/customer/tickets/${created.id}`)}>View Ticket</button>
            </div>
          )}
        </div>

        <div className="side-stack">
          <div className="card">
            <div className="card-head"><h3>Repository Connection</h3><span className="badge b-progress">Admin managed</span></div>
            <p className="hint">An administrator connects an authorized public repository after reviewing your ticket.</p>
          </div>
          <div className="card">
            <h3><Zap size={16} color="#7c3aed" /> What Happens Next?</h3>
            <ol className="ol">
              {[
                ['Connect Repository', 'An administrator connects an authorized public repository and starts the workflow.'],
                ['Investigate', 'AI Agent 1 analyzes the selected repository and identifies relevant files and potential causes.'],
                ['Validate', 'AI Agent 2 confirms the root cause with evidence.'],
                ['Fix', 'AI Agent 3 generates the correct code patch for the issue.'],
                ['Test', 'AI Agent 4 tests the fix to ensure it works without breaking existing features.'],
              ].map(([title, text], i) => (
                <li key={title}><span className="num">{i + 1}</span><div><b>{title}</b><div className="hint">{text}</div></div></li>
              ))}
            </ol>
          </div>
          <div className="card" style={{ background: '#eefbf3' }}>
            <h3><CheckCircle2 size={16} color="#16a34a" /> Important Notes</h3>
            {['Provide a clear and descriptive bug report.', 'Include all the steps to reproduce the issue.', 'Add screenshots or log files (if available).', 'The fix will be reviewed by an Admin before updating the GitHub repository.'].map((text) => (
              <div className="checkline" key={text}><Check size={16} /> {text}</div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  )
}
