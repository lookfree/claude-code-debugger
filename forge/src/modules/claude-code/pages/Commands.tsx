import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api, SlashCommand } from '../../../lib/tauri'

const s = {
  container: { padding: 24, display: 'flex', gap: 24, height: '100%', overflow: 'hidden', color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  panel: { width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, gap: 12 },
  main: { flex: 1, overflowY: 'auto' as const },
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: '#6b7280' },
  input: { width: '100%', boxSizing: 'border-box' as const, background: '#1f1f1f', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', color: '#e5e5e5', fontSize: 13 },
  textarea: { width: '100%', boxSizing: 'border-box' as const, background: '#1f1f1f', border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', color: '#e5e5e5', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' as const, minHeight: 200 },
  list: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  item: (active: boolean) => ({ padding: '8px 12px', borderRadius: 6, border: `1px solid ${active ? '#3b82f6' : '#1f1f1f'}`, background: active ? '#1e3a5f' : '#141414', cursor: 'pointer', textAlign: 'left' as const, color: active ? '#3b82f6' : '#e5e5e5', fontSize: 13, fontWeight: active ? 600 : 400 }),
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: '#1f2937', color: '#9ca3af', fontSize: 11, border: '1px solid #374151' },
  btn: { padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnDanger: { padding: '6px 14px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnGhost: { padding: '6px 14px', background: 'transparent', color: '#a3a3a3', border: '1px solid #374151', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
}

export default function Commands() {
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [selected, setSelected] = useState<SlashCommand | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.commands.getAll()
      setCommands(data)
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

  const filtered = commands.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const handleSelect = (cmd: SlashCommand) => {
    setSelected(cmd)
    setEditContent(cmd.content)
    setEditing(false)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await api.commands.save({ ...selected, content: editContent })
      await load()
      setEditing(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    await api.commands.delete(selected.name)
    setSelected(null)
    await load()
  }

  const handleNew = async () => {
    const name = prompt('Command name (no leading slash):')
    if (!name) return
    const cmd: SlashCommand = { name, content: '# New command\n', location: 'user' }
    await api.commands.save(cmd)
    await load()
    setSelected(cmd)
    setEditContent(cmd.content)
    setEditing(true)
  }

  return (
    <div style={s.container}>
      <div style={s.panel}>
        <div>
          <div style={s.heading}>Commands</div>
          <div style={s.sub}>Slash commands</div>
        </div>
        <input
          style={s.input}
          placeholder="Search commands..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={s.sub}>{filtered.length} / {commands.length} commands</div>
        <div style={s.list}>
          {loading ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>No commands found</div>
          ) : filtered.map(cmd => (
            <button
              key={cmd.name}
              style={s.item(selected?.name === cmd.name)}
              onClick={() => handleSelect(cmd)}
            >
              <div>/{cmd.name}</div>
              <span style={s.badge}>{cmd.location}</span>
            </button>
          ))}
        </div>
        <button style={s.btn} onClick={handleNew}>+ New Command</button>
      </div>

      <div style={s.main}>
        {selected ? (
          <>
            <div style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>/{selected.name}</div>
                {selected.description && <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>{selected.description}</div>}
                <span style={{ ...s.badge, marginTop: 6, display: 'inline-block' }}>{selected.location}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {editing ? (
                  <>
                    <button style={s.btn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    <button style={s.btnGhost} onClick={() => { setEditing(false); setEditContent(selected.content) }}>Cancel</button>
                  </>
                ) : (
                  <button style={s.btnGhost} onClick={() => setEditing(true)}>Edit</button>
                )}
                <button style={s.btnDanger} onClick={handleDelete}>Delete</button>
              </div>
            </div>
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
            <div style={s.card}>
              <div style={s.label}>Content</div>
              {editing ? (
                <textarea
                  style={s.textarea}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                />
              ) : (
                <pre style={{ background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 6, padding: 16, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                  {selected.content}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
            Select a command to view details
          </div>
        )}
      </div>
    </div>
  )
}
