import { useEffect, useState } from 'react'
import { api, ClaudeMdFile } from '../../../lib/tauri'

const s = {
  container: { padding: 24, display: 'flex', gap: 24, height: '100%', overflow: 'hidden', color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  panel: { width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, gap: 10 },
  main: { flex: 1, overflowY: 'auto' as const },
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: '#6b7280' },
  list: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  item: (active: boolean) => ({ padding: '8px 12px', borderRadius: 6, border: `1px solid ${active ? '#3b82f6' : '#1f1f1f'}`, background: active ? '#1e3a5f' : '#141414', cursor: 'pointer', textAlign: 'left' as const, color: active ? '#3b82f6' : '#e5e5e5', fontSize: 13, fontWeight: active ? 600 : 400 }),
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: '#1f2937', color: '#9ca3af', fontSize: 11, border: '1px solid #374151' },
  btn: { padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnGhost: { padding: '6px 14px', background: 'transparent', color: '#a3a3a3', border: '1px solid #374151', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  textarea: { width: '100%', boxSizing: 'border-box' as const, background: '#1f1f1f', border: '1px solid #374151', borderRadius: 6, padding: '10px', color: '#e5e5e5', fontSize: 13, fontFamily: 'monospace', resize: 'vertical' as const, minHeight: 400, lineHeight: 1.6 },
}

export default function ClaudeMd() {
  const [files, setFiles] = useState<ClaudeMdFile[]>([])
  const [selected, setSelected] = useState<ClaudeMdFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.claudeMD.getAll()
      setFiles(data)
      if (data.length > 0 && !selected) {
        setSelected(data[0])
        setEditContent(data[0].content)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSelect = (f: ClaudeMdFile) => {
    setSelected(f)
    setEditContent(f.content)
    setEditing(false)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await api.claudeMD.save(selected.file_path, editContent)
      setSelected({ ...selected, content: editContent, exists: true })
      setEditing(false)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.container}>
      <div style={s.panel}>
        <div>
          <div style={s.heading}>CLAUDE.md</div>
          <div style={s.sub}>Claude configuration files</div>
        </div>
        <div style={s.list}>
          {loading ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>
          ) : files.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>No files found</div>
          ) : files.map(f => (
            <button
              key={f.file_path}
              style={s.item(selected?.file_path === f.file_path)}
              onClick={() => handleSelect(f)}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{f.location}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {f.exists ? 'exists' : 'not created'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={s.main}>
        {selected ? (
          <>
            <div style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  CLAUDE.md
                  <span style={{ ...s.badge, marginLeft: 8 }}>{selected.location}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
                  {selected.file_path}
                </div>
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
              </div>
            </div>
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
            {!selected.exists && !editing && (
              <div style={{ color: '#f59e0b', fontSize: 13, marginBottom: 12 }}>
                This file does not exist yet. Click Edit to create it.
              </div>
            )}
            <div style={s.card}>
              <div style={s.label}>Content</div>
              {editing ? (
                <textarea
                  style={s.textarea}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  placeholder="# CLAUDE.md&#10;&#10;Write your Claude instructions here..."
                />
              ) : (
                <pre style={{ background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 6, padding: 16, fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.6, minHeight: 200, color: '#e5e5e5' }}>
                  {selected.content || '(empty)'}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
            Select a file to view
          </div>
        )}
      </div>
    </div>
  )
}
