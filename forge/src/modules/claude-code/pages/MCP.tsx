import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api, McpServer } from '../../../lib/tauri'

const s = {
  container: { padding: 24, color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif', maxWidth: 900 },
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 20 },
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6 },
  input: { width: '100%', boxSizing: 'border-box' as const, background: '#1f1f1f', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', color: '#e5e5e5', fontSize: 13 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: '#1f2937', color: '#9ca3af', fontSize: 11, border: '1px solid #374151' },
  btn: { padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnDanger: { padding: '6px 14px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnGhost: { padding: '6px 14px', background: 'transparent', color: '#a3a3a3', border: '1px solid #374151', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
}

export default function MCP() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // Add form
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.mcp.getAll()
      setServers(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    let unlisten: (() => void) | undefined
    listen('files:changed', load).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  const handleDelete = async (name: string) => {
    await api.mcp.delete(name)
    await load()
  }

  const handleTest = async (name: string) => {
    const ok = await api.mcp.testConnection(name)
    alert(ok ? `${name}: reachable` : `${name}: not reachable`)
  }

  const handleAdd = async () => {
    if (!newName.trim() || !newCommand.trim()) { setError('Name and command are required'); return }
    setSaving(true)
    setError(null)
    try {
      const args = newArgs.trim() ? newArgs.split(',').map(a => a.trim()) : []
      await api.mcp.save(newName, { command: newCommand, args })
      setNewName(''); setNewCommand(''); setNewArgs('')
      setShowAdd(false)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <div style={s.heading}>MCP Servers</div>
          <div style={s.sub}>Manage Model Context Protocol servers</div>
        </div>
        <button style={s.btn} onClick={() => setShowAdd(!showAdd)}>+ Add Server</button>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {showAdd && (
        <div style={s.card}>
          <div style={s.label}>New MCP Server</div>
          <div style={s.row}>
            <span style={{ minWidth: 80, fontSize: 13, color: '#9ca3af' }}>Name</span>
            <input style={s.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="my-mcp-server" />
          </div>
          <div style={s.row}>
            <span style={{ minWidth: 80, fontSize: 13, color: '#9ca3af' }}>Command</span>
            <input style={s.input} value={newCommand} onChange={e => setNewCommand(e.target.value)} placeholder="npx" />
          </div>
          <div style={s.row}>
            <span style={{ minWidth: 80, fontSize: 13, color: '#9ca3af' }}>Args</span>
            <input style={s.input} value={newArgs} onChange={e => setNewArgs(e.target.value)} placeholder="-y, @my/mcp-server (comma-separated)" />
          </div>
          <button style={s.btn} onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>
      ) : servers.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          No MCP servers configured
        </div>
      ) : servers.map(srv => {
        const cfg = srv.config as Record<string, unknown>
        const cfgDesc = cfg.description ? String(cfg.description) : ''
        return (
          <div key={srv.name} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{srv.name}</div>
                {cfgDesc && (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{cfgDesc}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={s.btnGhost} onClick={() => handleTest(srv.name)}>Test</button>
                <button style={s.btnDanger} onClick={() => handleDelete(srv.name)}>Delete</button>
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              {!!cfg.command && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: '#6b7280' }}>Command: </span>
                  <code style={{ background: '#1f1f1f', padding: '1px 6px', borderRadius: 4 }}>{String(cfg.command)}</code>
                </div>
              )}
              {Array.isArray(cfg.args) && cfg.args.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: '#6b7280' }}>Args: </span>
                  {(cfg.args as string[]).map((a, i) => (
                    <code key={i} style={{ background: '#1f1f1f', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>{a}</code>
                  ))}
                </div>
              )}
              {!!cfg.disabled && <span style={s.badge}>Disabled</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
