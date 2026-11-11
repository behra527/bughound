import { useEffect, useState } from 'react'
import { Building2, Camera, CheckCircle2, Clock3, Lock, Mail, Phone, Save, Ticket, User, XCircle } from 'lucide-react'
import Shell from '../../components/Shell'
import { useApp } from '../../context'

export default function Profile() {
  const { profile, updateProfile, changePassword, tickets, notify } = useApp()
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState(null)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  const save = async () => {
    if (!form.name.trim() || !form.email.includes('@')) {
      notify('Name and a valid email are required')
      return
    }
    try {
      await updateProfile(form)
      notify('Profile saved')
    } catch (error) {
      notify(error.message)
    }
  }

  const savePw = async (e) => {
    e.preventDefault()
    if (pw.next.length < 12 || pw.next !== pw.confirm) {
      notify('New password must match and be at least 12 characters')
      return
    }
    try {
      await changePassword(pw.current, pw.next)
      setPw({ current: '', next: '', confirm: '' })
      notify('Password updated')
    } catch (error) {
      notify(error.message)
    }
  }

  const counts = {
    total: tickets.length,
    progress: tickets.filter((t) => t.status === 'In Progress' || t.status === 'Investigating').length,
    resolved: tickets.filter((t) => t.status === 'Resolved').length,
    rejected: tickets.filter((t) => t.status === 'Rejected').length,
  }

  if (!profile || !form) {
    return <Shell title="Profile"><div className="card"><p className="hint">Loading account profile…</p></div></Shell>
  }

  return (
    <Shell title="Profile" subtitle="View and manage your account information, and update your password.">
      <div className="split">
        <div>
          <div className="tabs">
            <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}><User size={14} /> Profile Information</button>
            <button className={tab === 'pw' ? 'on' : ''} onClick={() => setTab('pw')}><Lock size={14} /> Change Password</button>
          </div>
          {tab === 'info' ? (
            <div className="card">
              <h3><User size={16} /> Profile Information</h3>
              <p className="hint">Update your personal details and account information.</p>
              <div className="two-col">
                <div className="field"><label>Full Name <span className="req">*</span></label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="field"><label><Phone size={14} /> Phone Number</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="two-col">
                <div className="field">
                  <label><Mail size={14} /> Email Address <span className="req">*</span></label>
                  <div className="lock-mail"><input value={form.email} readOnly /><Lock size={14} color="#8a849f" /></div>
                </div>
                <div className="field"><label><Building2 size={14} /> Organization (Optional)</label><input value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} /></div>
              </div>
              <div className="field">
                <label>Bio (Optional)</label>
                <textarea rows={4} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                <div className="count">{form.bio.length} / 300</div>
              </div>
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => setForm(profile)}>Cancel</button>
                <button className="btn btn-primary" onClick={save}><Save size={14} /> Save Changes</button>
              </div>
            </div>
          ) : (
            <form className="card" onSubmit={savePw}>
              <h3><Lock size={16} /> Change Password</h3>
              <div className="field"><label>Current Password</label><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
              <div className="field"><label>New Password</label><input type="password" minLength={12} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
              <div className="field"><label>Confirm Password</label><input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
              <button className="btn btn-primary" type="submit">Update Password</button>
            </form>
          )}
        </div>
        <div className="side-stack">
          <div className="card" style={{ background: 'linear-gradient(180deg,#f7f3ff,#fff)' }}>
            <div className="profile-hero">
              <div className="avatar lg">{form.name.slice(0, 1)}<span className="cam"><Camera size={12} /></span></div>
              <div>
                <b>{form.name}</b>
                <div><span className="badge b-run">Customer</span></div>
                <div className="hint">{form.email}</div>
                <div className="hint">{form.phone}</div>
                <div className="hint">{form.org}</div>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Ticket Statistics</h3>
            <div className="two-col">
              {[[Ticket, 'purple', counts.total, 'Total Tickets'], [Clock3, 'amber', counts.progress, 'In Progress'], [CheckCircle2, 'green', counts.resolved, 'Resolved'], [XCircle, 'red', counts.rejected, 'Rejected']].map(([Icon, tone, value, label]) => (
                <div className={`stat ${tone}`} key={label}><div className="ico"><Icon size={16} /></div><div><b>{value}</b><span>{label}</span></div></div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Account Information</h3>
            <div className="kv">
              <span>Account Created</span><b>{profile.created}</b>
              <span>Role</span><span className="badge b-run">Customer</span>
              <span>Account Status</span><span className="badge b-resolved">Active</span>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
