import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bot, Info, Mail, Send } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!email.includes('@')) {
      setError('Enter the email registered on your account.')
      return
    }
    setError('Password reset email is not configured. Contact your administrator to restore access.')
  }

  return (
    <AuthLayout art="forgot">
      <Link to="/login" className="back"><ArrowLeft size={16} /> Back to Login</Link>
      <form className="auth-card" onSubmit={submit}>
        <div className="center-brand"><Bot /> AI BugFixer</div>
        <h2>Forgot Password?</h2>
        <p className="sub">Email-based password recovery is not configured for this deployment.</p>
        <div className="field">
          <label><Mail size={14} /> Email Address</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your registered email" />
        </div>
        {error && <p className="hint" style={{ color: '#dc2626' }}>{error}</p>}
        <button className="btn btn-primary btn-block" type="submit"><Send size={16} /> Check Recovery Availability</button>
        <div className="info-box"><Info size={16} color="#7c3aed" /> Contact an administrator; do not share your password by email.</div>
      </form>
    </AuthLayout>
  )
}
