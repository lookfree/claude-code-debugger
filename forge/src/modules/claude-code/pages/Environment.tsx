import { useState, useEffect } from 'react'
import { api, ToolDetection, EnvVar } from '../../../lib/tauri'

const s = {
  container: { padding: 24, color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
  section: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16, marginBottom: 16 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #1a1a1a', fontSize: 13 },
  btn: { padding: '5px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 },
  btnGhost: { padding: '5px 12px', background: 'transparent', color: '#a3a3a3', border: '1px solid #374151', borderRadius: 6, cursor: 'pointer', fontSize: 12 },
  btnDanger: { padding: '5px 12px', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: 12 },
  input: { background: '#1f1f1f', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', color: '#e5e5e5', fontSize: 12 },
}

export default function Environment() {
  const [tools, setTools] = useState<ToolDetection[]>([])
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [apiConnected, setApiConnected] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.environment.detectTools().then(setTools).catch(e => setError(String(e)))
    api.environment.getEnvVars().then(setEnvVars).catch(e => setError(String(e)))
  }, [])

  const handleAddVar = async () => {
    if (!newKey.trim()) return
    await api.environment.setEnvVar(newKey, newValue)
    setNewKey(''); setNewValue('')
    setEnvVars(await api.environment.getEnvVars())
  }

  const handleDeleteVar = async (key: string) => {
    await api.environment.deleteEnvVar(key)
    setEnvVars(await api.environment.getEnvVars())
  }

  const handleTestApi = async () => {
    try {
      const ok = await api.environment.testApiConnection()
      setApiConnected(ok)
    } catch (e) { setError(String(e)) }
  }

  return (
    <div style={s.container}>
      <div style={s.heading}>Environment</div>
      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <div style={s.section}>
        <div style={s.label}>API & Connectivity</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#a3a3a3' }}>ANTHROPIC_API_KEY</span>
          <span style={{ flex: 1 }} />
          <button style={s.btnGhost} onClick={handleTestApi}>Test Connection</button>
          {apiConnected === true && <span style={{ color: '#10b981', fontSize: 12 }}>● connected</span>}
          {apiConnected === false && <span style={{ color: '#ef4444', fontSize: 12 }}>● failed</span>}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.label}>PATH Detection</div>
        {tools.map(t => (
          <div key={t.name} style={s.row}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.name}</span>
            <span>{t.found ? <span style={{ color: '#10b981' }}>found</span> : <span style={{ color: '#ef4444' }}>not found</span>}</span>
            <span style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{t.path ?? ''}</span>
            <span style={{ color: '#6b7280', fontSize: 12 }}>{t.version ?? ''}</span>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.label}>Custom Environment Variables</div>
        {envVars.map(v => (
          <div key={v.key} style={s.row}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#60a5fa' }}>{v.key}</span>
            <span style={{ flex: 1, marginLeft: 16, color: '#a3a3a3', fontSize: 12 }}>{v.value}</span>
            <button style={s.btnDanger} onClick={() => handleDeleteVar(v.key)}>Delete</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY" style={{ ...s.input, width: 160 }} />
          <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="value" style={{ ...s.input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleAddVar()} />
          <button style={s.btn} onClick={handleAddVar}>+ Add</button>
        </div>
      </div>
    </div>
  )
}
