import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bot, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { useApp } from '../context'

export default function Login() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email.includes('@') || password.length < 4) {
      setError('Enter a valid email and a password of at least 4 characters.')
      return
    }
    setError('')
    try {
      const account = await login(email, password)
      navigate(account.role === 'admin' ? '/admin' : '/customer')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit}>
        <div className="center-brand"><Bot /> AI BugFixer</div>
        <h2>Login to Your Account</h2>
        <p className="sub">Access the AI bug resolution platform</p>
        <div className="field">
          <label><Mail size={14} /> Email Address</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" />
        </div>
        <div className="field">
          <label><Lock size={14} /> Password</label>
          <div className="pw">
            <input type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
            <button type="button" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
        <div className="row-between">
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label>
          <Link to="/forgot-password" style={{ color: '#7c3aed', fontWeight: 700 }}>Forgot Password?</Link>
        </div>
        {error && <p className="hint" style={{ color: '#dc2626' }}>{error}</p>}
        <button className="btn btn-primary btn-block" type="submit"><ArrowRight size={16} /> Login</button>
        <div className="demo">Customer accounts are created by an administrator.</div>
      </form>
    </AuthLayout>
  )
}
