import { useState } from 'react'
import './App.css'
import { useNavigate } from 'react-router-dom'

function sha256Hex(message) {
  const enc = new TextEncoder()
  return crypto.subtle.digest('SHA-256', enc.encode(message)).then((hash) => {
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  })
}

export default function Login() {
  const [mode, setMode] = useState('login') // or 'register'
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const validatePassword = (pw) => {
    if (pw.length < 8) return 'Password must be at least 8 characters'
    if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter'
    if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter'
    if (!/[0-9]/.test(pw)) return 'Password must include a number'
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a symbol'
    return null
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)

    if (!email || !password || (mode === 'register' && !username)) {
      setError('Please fill in all fields')
      return
    }

    const pwErr = validatePassword(password)
    if (pwErr) {
      setError(pwErr)
      return
    }

    setLoading(true)
    try {
      // Hash on client-side (SHA-256 hex) before sending; server will bcrypt it again
      const pwHash = await sha256Hex(password)

      const payload = mode === 'register'
        ? { name: username, email, password: pwHash }
        : { email, password: pwHash }

      const url = mode === 'register' ? 'http://localhost:5001/auth/register' : 'http://localhost:5001/auth/login'

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      if (mode === 'login') {
        // Save token/user if returned (simulated)
        if (data.token) localStorage.setItem('authToken', data.token)
        if (data.user) localStorage.setItem('userData', JSON.stringify(data.user))
        navigate('/')
      } else {
        // registered
        navigate('/login')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>{mode === 'login' ? 'Login' : 'Create account'}</h2>
        <form onSubmit={submit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />

          {mode === 'register' && (
            <>
              <label>Username</label>
              <input value={username} onChange={(e)=>setUsername(e.target.value)} required />
            </>
          )}

          <label>Password</label>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />

          {error && <p className="error">{error}</p>}

          <button type="submit" className="analyze-btn" disabled={loading}>
            {loading ? 'Working…' : mode === 'login' ? 'Login' : 'Register'}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <p>Don't have an account? <button onClick={()=>setMode('register')}>Create one</button></p>
          ) : (
            <p>Already have an account? <button onClick={()=>setMode('login')}>Sign in</button></p>
          )}
        </div>
      </div>
    </div>
  )
}
