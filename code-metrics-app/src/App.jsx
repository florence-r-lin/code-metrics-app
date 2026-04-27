import { useState, useRef } from 'react'
import './App.css'

const NUMERIC_KEYS = [
  { key: 'LOC', label: 'Lines of Code' },
  { key: 'CycloComplexity', label: 'Cyclomatic Complexity' },
  { key: 'Number Of Functions', label: 'Functions' },
  { key: 'Number of Loops', label: 'Loops' },
  { key: 'Max Depth', label: 'Max Depth' },
  { key: 'Comment Percentage', label: 'Comment %', pct: true },
  { key: 'Docstring Percentage', label: 'Docstring %', pct: true },
  { key: 'Average Function Length', label: 'Avg Fn Length' },
]

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('authToken'))
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('login') // or 'register'
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef()

  function handleFile(f) {
    setError(null)
    setResult(null)
    if (!f?.name.endsWith('.zip')) {
      setError('Please select a .zip file.')
      return
    }
    setFile(f)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  async function handleLogin({ email, password }) {
    try {
      const res = await fetch('http://localhost:5001/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      setCurrentUser(data.user)
      setAuthToken(data.token)
      localStorage.setItem('authToken', data.token)
      localStorage.setItem('userData', JSON.stringify(data.user))
      setShowAuth(false)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleRegister({ name, email, password }) {
    try {
      const res = await fetch('http://localhost:5001/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      setCurrentUser(data.user)
      setAuthToken(data.token)
      localStorage.setItem('authToken', data.token)
      localStorage.setItem('userData', JSON.stringify(data.user))
      setShowAuth(false)
    } catch (err) {
      alert(err.message)
    }
  }

  async function analyze() {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const headers = {}
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const res = await fetch('http://localhost:5001/analyze', {
        method: 'POST',
        headers,
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unknown error')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <h1>Code Metrics</h1>
          <div>
            {currentUser ? (
              <button onClick={() => { setCurrentUser(null); setAuthToken(null); localStorage.removeItem('authToken'); localStorage.removeItem('userData') }}>Logout ({currentUser.name})</button>
            ) : (
              <button onClick={() => { setShowAuth(true); setAuthMode('login') }}>Login / Register</button>
            )}
          </div>
        </div>
        <p className="subtitle">Harvey Mudd College &mdash; Upload a .zip of Python files to analyze</p>
      </header>

      <div
        className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {file
          ? <><span className="file-icon">📦</span><span className="file-name">{file.name}</span></>
          : <><span className="file-icon">+</span><span>Drop a .zip here or click to browse</span></>
        }
      </div>

      {error && <p className="error">{error}</p>}

      {showAuth && <AuthModal mode={authMode} onClose={() => setShowAuth(false)} onLogin={handleLogin} onRegister={handleRegister} />}

      <button className="analyze-btn" onClick={analyze} disabled={!file || loading}>
        {loading ? 'Analyzing…' : 'Analyze'}
      </button>

      {result && <Results result={result} />}
    </div>
  )
}

function Results({ result }) {
  const { files, averages } = result
  const nonEmpty = files.filter(f => f.LOC > 0)

  return (
    <div className="results">
      <h2>Averages <span className="file-count">across {nonEmpty.length} file{nonEmpty.length !== 1 ? 's' : ''}</span></h2>
      <div className="cards">
        {NUMERIC_KEYS.map(({ key, label, pct }) => (
          <div className="card" key={key}>
            <div className="card-value">
              {averages[key] != null
                ? pct ? `${averages[key]}%` : averages[key]
                : '—'}
            </div>
            <div className="card-label">{label}</div>
          </div>
        ))}
      </div>

      <h2>Per-file breakdown</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>LOC</th>
              <th>Complexity</th>
              <th>Functions</th>
              <th>Loops</th>
              <th>Max Depth</th>
              <th>Comment %</th>
              <th>Docstring %</th>
              <th>Avg Fn Length</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f['File Name']} className={f.LOC === 0 ? 'empty-file' : ''}>
                <td className="filename">{f['File Name']}</td>
                <td>{f['LOC']}</td>
                <td>{f['CycloComplexity']}</td>
                <td>{f['Number Of Functions']}</td>
                <td>{f['Number of Loops']}</td>
                <td>{f['Max Depth']}</td>
                <td>{f['Comment Percentage']?.toFixed(1)}%</td>
                <td>{f['Docstring Percentage']?.toFixed(1)}%</td>
                <td>{f['Average Function Length']}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AuthModal({ mode = 'login', onClose, onLogin, onRegister }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localMode, setLocalMode] = useState(mode)

  const isRegister = localMode === 'register'

  function submit(e) {
    e.preventDefault()
    if (isRegister) {
      onRegister({ name, email, password })
    } else {
      onLogin({ email, password })
    }
  }

  return (
    <div className="auth-modal">
      <div className="auth-content">
        <button className="close" onClick={onClose}>✕</button>
        <h3>{isRegister ? 'Register' : 'Login'}</h3>
        <form onSubmit={submit}>
          <div style={{ marginBottom: '0.5rem' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setLocalMode(isRegister ? 'login' : 'register') }}>{isRegister ? 'Already have an account? Login' : 'Create an account'}</a>
          </div>
          {isRegister && (
            <div>
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
        </form>
      </div>
    </div>
  )
}
