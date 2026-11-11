import { Bot, Check, Code2, Search, Shield } from 'lucide-react'

export default function AuthLayout({ children, art = 'login' }) {
  return (
    <div className="auth-page">
      <section className="hero">
        <div className="hero-brand"><Bot /> AI BugFixer</div>
        <h2>Autonomous AI Bug Diagnosis & Patch Resolution System</h2>
        <p className="lead">Report software bugs, let AI agents diagnose, fix, test, and update the code automatically.</p>
        <Illustration mode={art} />
        <div className="flow">
          {[[Search, 'Investigate Bug'], [Shield, 'Validate Root Cause'], [Code2, 'Generate Fix'], [Check, 'Test & Update Code']].map(([Icon, label], i) => (
            <div key={label} style={{ display: 'contents' }}>
              <div className="item">
                <div className="bubble"><Icon size={20} /></div>
                {label}
              </div>
              {i < 3 && <div style={{ alignSelf: 'center', opacity: 0.6 }}>›</div>}
            </div>
          ))}
        </div>
      </section>
      <section className="auth-side">{children}</section>
    </div>
  )
}

function Illustration({ mode }) {
  return (
    <svg className="scene" viewBox="0 0 520 280" fill="none" aria-hidden="true">
      <ellipse cx="260" cy="230" rx="170" ry="28" fill="#7c3aed" opacity="0.25" />
      <ellipse cx="260" cy="230" rx="120" ry="16" stroke="#c4b5fd" strokeDasharray="4 6" />
      <rect x="150" y="78" width="230" height="150" rx="16" fill="#2a2158" stroke="#a78bfa" />
      <rect x="166" y="96" width="198" height="108" rx="6" fill="#120e28" />
      <rect x="178" y="110" width="90" height="6" rx="3" fill="#22d3ee" />
      <rect x="178" y="124" width="130" height="6" rx="3" fill="#a78bfa" />
      <rect x="178" y="138" width="70" height="6" rx="3" fill="#34d399" />
      <rect x="178" y="152" width="110" height="6" rx="3" fill="#60a5fa" />
      <rect x="230" y="214" width="70" height="8" rx="3" fill="#6d28d9" />
      {mode === 'login' ? (
        <>
          <rect x="300" y="40" width="78" height="78" rx="16" fill="#38bdf8" />
          <text x="318" y="88" fill="#fff" fontSize="28" fontWeight="700">AI</text>
          <rect x="96" y="92" width="62" height="50" rx="12" fill="#8b5cf6" />
          <text x="110" y="124" fill="#fff" fontSize="20">&lt;/&gt;</text>
          <circle cx="118" cy="188" r="22" fill="#312e81" stroke="#a78bfa" />
          <circle cx="400" cy="150" r="20" fill="#4c1d95" stroke="#c4b5fd" />
          <rect x="392" y="196" width="40" height="40" rx="10" fill="#7c3aed" />
          <path d="M404 216 l8 8 14-16" stroke="#fff" strokeWidth="3" />
        </>
      ) : (
        <>
          <circle cx="360" cy="150" r="46" fill="#ede9fe" opacity="0.2" stroke="#c4b5fd" />
          <circle cx="348" cy="140" r="28" stroke="#e9d5ff" strokeWidth="8" />
          <path d="M368 162 l28 28" stroke="#ddd6fe" strokeWidth="8" strokeLinecap="round" />
          <text x="336" y="146" fill="#f5d0fe" fontSize="18">🐞</text>
          <circle cx="120" cy="70" r="22" fill="#6d28d9" />
          <rect x="96" y="100" width="58" height="46" rx="10" fill="#7c3aed" />
          <text x="106" y="130" fill="#fff" fontSize="16">&lt;/&gt;</text>
        </>
      )}
    </svg>
  )
}
