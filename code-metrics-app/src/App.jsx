import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
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

  async function analyze() {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('http://localhost:5001/analyze', {
        method: 'POST',
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
          <nav>
            <Link to="/login" className="login-link">Login</Link>
          </nav>
        </div>
        <p className="subtitle">Upload a .zip of Python files to analyze</p>
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
