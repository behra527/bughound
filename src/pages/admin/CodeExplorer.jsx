import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, File, Folder, FolderOpen, Search } from 'lucide-react'
import Shell from '../../components/Shell'
import { StatusBadge, TicketBanner } from '../../components/ui'
import { commits, tree } from '../../data'
import { useApp } from '../../context'

const files = {
  'service.py': `36  def authenticate_user(email: str, password: str):
37      """Authenticate user with email and password."""
38      user = db.query(User).filter(User.email == email).first()
39
40      if not user:
41          return None
42
43      # BUG: Plain text comparison instead of hashed verification
44  -   if user.password == password:
45  +   if verify_password(password, user.password_hash):
46          return user
47
48      return None
50  def verify_password(password: str, hashed_password: str) -> bool:
51      """Verify password using bcrypt."""
52      import bcrypt
53      return bcrypt.checkpw(
54          password.encode('utf-8'),
55          hashed_password.encode('utf-8')
56      )`,
  'routes.py': `12  @router.post("/login")
13  def login(payload: LoginRequest):
14      user = authenticate_user(payload.email, payload.password)
15      if not user:
16          raise HTTPException(401, "invalid credentials")
17      return {"token": issue_token(user)}`,
  'models.py': `8   class User(Base):
9       email = Column(String, unique=True)
10      password_hash = Column(String)`,
  'main.py': `1   from app.auth.routes import router
2   app.include_router(router)`,
  'README.md': `# todo-app\nPublic sample repository used by AI BugFixer.`,
  'requirements.txt': `fastapi\nbcrypt\nsqlalchemy`,
  'worker.py': `def run():\n    print("worker")`,
  'test_auth.py': `def test_valid_login():\n    assert authenticate_user("a@b.com", "secret")`,
  'settings.py': `DATABASE_URL = "sqlite:///todo.db"`,
  'seed.py': `def seed():\n    pass`,
}

export default function CodeExplorer() {
  const { tickets, notify } = useApp()
  const ticket = tickets[0]
  const [tab, setTab] = useState('Code Explorer')
  const [file, setFile] = useState('service.py')
  const [q, setQ] = useState('')

  const copy = async () => {
    await navigator.clipboard.writeText(files[file] || '')
    notify('File copied')
  }

  return (
    <Shell title="GitHub Repository & Code Explorer" subtitle="Explore connected repository files, view commits, and analyze source code for the selected ticket.">
      <TicketBanner ticket={ticket} extra={<a className="btn btn-primary" style={{ marginLeft: 'auto' }} href={ticket.url} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink size={14} /></a>} />
      <div className="tabs">
        {['Code Explorer', 'Commits (24)', 'Repository Info', 'Indexed Snapshots', 'Analysis (AST & Call Graph)'].map((name) => (
          <button key={name} className={tab === name ? 'on' : ''} onClick={() => setTab(name)}>{name}{name.startsWith('Indexed') && <span className="badge b-resolved">Indexed</span>}</button>
        ))}
      </div>
      {tab === 'Code Explorer' && (
        <div className="three">
          <div className="card">
            <h3><Folder size={16} /> Repository Explorer</h3>
            <label className="search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files and folders..." /></label>
            <div className="tree"><Tree nodes={tree} active={file} onPick={setFile} query={q} /></div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3>app/auth/{file}</h3>
              <div>
                <button className="btn btn-ghost" onClick={() => notify('Raw file opened')}>Raw</button>
                <button className="btn btn-ghost" onClick={copy}><Copy size={14} /> Copy</button>
              </div>
            </div>
            <pre className="code">{(files[file] || '# file preview').split('\n').map((line) => {
              if (line.includes('-   ')) return <div className="r" key={line}>{line}</div>
              if (line.includes('+   ')) return <div className="a" key={line}>{line}</div>
              return <div key={line}>{line}</div>
            })}</pre>
          </div>
          <div className="side-stack">
            <div className="card">
              <h3>Repository Details</h3>
              <div className="kv">
                <span>Repository</span><b>{ticket.repo}</b>
                <span>Branch</span><b>{ticket.branch}</b>
                <span>Latest Commit</span><b>{ticket.commit}</b>
                <span>Language</span><b>Python</b>
                <span>Files</span><b>128</b>
                <span>Indexed Status</span><b>Indexed (5 min ago)</b>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Recent Commits</h3><button className="linkish" onClick={() => setTab('Commits (24)')}>View All →</button></div>
              {commits.map((c) => (
                <div key={c.hash} style={{ marginBottom: 10 }}>
                  <b>{c.hash}</b> {c.current && <span className="badge b-run">Current</span>}
                  <div>{c.msg}</div>
                  <div className="hint">{c.author} · {c.when}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab === 'Commits (24)' && (
        <div className="card">{commits.map((c) => <div key={c.hash} className="file-chip" style={{ marginBottom: 8 }}><Check size={14} /><div><b>{c.hash}</b> {c.msg}<div className="hint">{c.author} · {c.when}</div></div>{c.current && <StatusBadge status="In Progress" />}</div>)}</div>
      )}
      {tab === 'Repository Info' && <div className="card"><h3>example/todo-app</h3><p>Public repository. 128 files. Default branch main. Private repositories are not connected.</p></div>}
      {tab === 'Indexed Snapshots' && <div className="card"><h3>Indexed snapshot</h3><p>Commit a1b2c3d indexed 5 minutes ago. AST and file hashes are ready for Agent 1.</p></div>}
      {tab === 'Analysis (AST & Call Graph)' && (
        <div className="card">
          <h3>Call graph</h3>
          <p className="hint">login → authenticate_user → verify_password → bcrypt.checkpw</p>
          <div className="code">routes.login → auth.service.authenticate_user → auth.service.verify_password</div>
        </div>
      )}
    </Shell>
  )
}

function Tree({ nodes, active, onPick, query, depth = 0 }) {
  return nodes.filter((node) => !query || JSON.stringify(node).toLowerCase().includes(query.toLowerCase())).map((node) => <Node key={node.name + depth} node={node} active={active} onPick={onPick} query={query} />)
}

function Node({ node, active, onPick, query }) {
  const [open, setOpen] = useState(node.open || !!query)
  if (node.file) {
    return <button className={active === node.name ? 'on' : ''} onClick={() => onPick(node.name)}><File size={14} /> {node.name}</button>
  }
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{open ? <FolderOpen size={14} /> : <Folder size={14} />} {node.name}</button>
      {open && node.children && <div className="nest"><Tree nodes={node.children} active={active} onPick={onPick} query={query} /></div>}
    </div>
  )
}
