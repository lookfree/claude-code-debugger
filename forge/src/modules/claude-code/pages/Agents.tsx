import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api, Agent } from '../../../lib/tauri'

const s = {
  container: { padding: 24, display: 'flex', gap: 24, height: '100%', overflow: 'hidden', color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  panel: { width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, gap: 12 },
  main: { flex: 1, overflowY: 'auto' as const },
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: '#6b7280' },
  input: { width: '100%', boxSizing: 'border-box' as const, background: '#1f1f1f', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', color: '#e5e5e5', fontSize: 13 },
  list: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  item: (active: boolean) => ({ padding: '8px 12px', borderRadius: 6, border: `1px solid ${active ? '#3b82f6' : '#1f1f1f'}`, background: active ? '#1e3a5f' : '#141414', cursor: 'pointer', textAlign: 'left' as const, color: active ? '#3b82f6' : '#e5e5e5', fontSize: 13, fontWeight: active ? 600 : 400 }),
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: '#1f2937', color: '#9ca3af', fontSize: 11, border: '1px solid #374151' },
  pre: { background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 6, padding: 16, overflowX: 'auto' as const, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const },
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.agents.getAll()
      setAgents(data)
      if (data.length > 0 && !selected) setSelected(data[0])
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

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div style={s.container}>
      <div style={s.panel}>
        <div>
          <div style={s.heading}>Agents</div>
          <div style={s.sub}>Manage Claude Code subagents</div>
        </div>
        <input
          style={s.input}
          placeholder="Search agents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={s.sub}>{filtered.length} / {agents.length} agents</div>
        <div style={s.list}>
          {loading ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>No agents found</div>
          ) : filtered.map(agent => (
            <button
              key={agent.name}
              style={s.item(selected?.name === agent.name)}
              onClick={() => setSelected(agent)}
            >
              <div>{agent.name}</div>
              <span style={s.badge}>{agent.location}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={s.main}>
        {selected ? (
          <>
            <div style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{selected.name}</div>
                <div style={{ color: '#9ca3af', marginTop: 4, fontSize: 14 }}>{selected.description}</div>
              </div>
              <span style={s.badge}>{selected.location}</span>
            </div>
            {selected.dependencies && selected.dependencies.length > 0 && (
              <div style={s.card}>
                <div style={s.label}>Dependencies</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selected.dependencies.map(dep => (
                    <span key={dep} style={s.badge}>{dep}</span>
                  ))}
                </div>
              </div>
            )}
            {selected.content && (
              <div style={s.card}>
                <div style={s.label}>Content</div>
                <pre style={s.pre}>{selected.content}</pre>
              </div>
            )}
            {selected.file_path && (
              <div style={s.card}>
                <div style={s.label}>File Path</div>
                <code style={{ fontSize: 12, color: '#9ca3af' }}>{selected.file_path}</code>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
            Select an agent to view details
          </div>
        )}
      </div>
    </div>
  )
}
