import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3, Bell, Bot, ChevronDown, Cpu, FlaskConical, FolderGit2, GitPullRequest,
  Home, LogOut, Menu, Plus, Settings, Ticket, User, Users,
} from 'lucide-react'
import { useApp } from '../context'

const customerNav = [
  { to: '/customer', label: 'Dashboard', icon: Home, end: true },
  { to: '/customer/create', label: 'Create Bug Ticket', icon: Plus },
  { to: '/customer/tickets', label: 'My Tickets', icon: Ticket },
  { to: '/customer/profile', label: 'Profile', icon: User },
]

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: Home, end: true },
  { to: '/admin/tickets', label: 'Tickets', icon: Ticket },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/repositories', label: 'Repositories', icon: FolderGit2 },
  { to: '/admin/agents', label: 'AI Agents', icon: Cpu },
  { to: '/admin/testing', label: 'Testing & Verification', icon: FlaskConical },
  { to: '/admin/github', label: 'GitHub Updates', icon: GitPullRequest },
  { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
  { to: '/admin/settings', label: 'System Settings', icon: Settings },
]

export default function Shell({ title, subtitle, children }) {
  const { user, logout } = useApp()
  const navigate = useNavigate()
  const [openMenu, setOpenMenu] = useState(false)
  const [openNotes, setOpenNotes] = useState(false)
  const [openSide, setOpenSide] = useState(false)
  const items = user?.role === 'admin' ? adminNav : customerNav
  const letter = user?.role === 'admin' ? 'A' : 'C'
  const name = user?.role === 'admin' ? 'Admin' : 'Customer'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${openSide ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Bot size={20} /></div>
          <div>
            <h1>AI BugFixer</h1>
            <p>AI Bug Diagnosis & Patch Resolution System</p>
          </div>
        </div>
        <nav className="nav">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setOpenSide(false)}>
              <item.icon size={16} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-user">
          <div className="avatar sm">{letter}</div>
          <div>
            <strong>{name}</strong>
            <span>{user?.email}</span>
          </div>
          <button className="icon-btn" title="Logout" onClick={() => { logout(); navigate('/login') }}><LogOut size={16} /></button>
        </div>
      </aside>
      <section className="main">
        <header className="topbar">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="menu-toggle" onClick={() => setOpenSide((v) => !v)}><Menu size={18} /></button>
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <div className="top-actions">
            <button className="bell" onClick={() => { setOpenNotes((v) => !v); setOpenMenu(false) }}>
              <Bell size={18} /><i />
            </button>
            <button className="who" onClick={() => { setOpenMenu((v) => !v); setOpenNotes(false) }}>
              <span className="avatar sm">{letter}</span> {name} <ChevronDown size={16} />
            </button>
            {openNotes && (
              <div className="note-pop">
                <div className="note"><b>Agent 3 is generating a patch</b><span>T-102 · just now</span></div>
                <div className="note"><b>T-100 resolved on GitHub</b><span>Nov 09, 05:20 PM</span></div>
                <div className="note"><b>New ticket needs review</b><span>T-111 · Nov 10, 09:40 AM</span></div>
              </div>
            )}
            {openMenu && (
              <div className="menu-pop">
                {user?.role === 'customer' && <button onClick={() => navigate('/customer/profile')}>Profile</button>}
                {user?.role === 'admin' && <button onClick={() => navigate('/admin/settings')}>System Settings</button>}
                <button onClick={() => { logout(); navigate('/login') }}>Logout</button>
              </div>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
      </section>
    </div>
  )
}
