import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api, DependencyGraph } from '../../../lib/tauri'

const s = {
  container: { padding: 24, color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif', height: '100%', overflowY: 'auto' as const },
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 20 },
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 },
  statCard: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16, textAlign: 'center' as const },
  badge: (color: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: color + '22', color: color, fontSize: 11, border: `1px solid ${color}44` }),
}

const NODE_COLORS: Record<string, string> = {
  skill: '#3b82f6',
  agent: '#8b5cf6',
  hook: '#10b981',
  command: '#f59e0b',
}

export default function Graph() {
  const [graph, setGraph] = useState<DependencyGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.graph.getDependencies()
      setGraph(data)
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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
        Building dependency graph...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#ef4444' }}>Error: {error}</div>
    )
  }

  const nodes = graph?.nodes ?? []
  const edges = graph?.edges ?? []

  // Stats by type
  const counts: Record<string, number> = {}
  nodes.forEach(n => { counts[n.node_type] = (counts[n.node_type] ?? 0) + 1 })

  const filteredNodes = filter === 'all' ? nodes : nodes.filter(n => n.node_type === filter)
  const filteredEdges = edges.filter(e => {
    const srcNode = nodes.find(n => n.id === e.source)
    const tgtNode = nodes.find(n => n.id === e.target)
    if (filter === 'all') return true
    return srcNode?.node_type === filter || tgtNode?.node_type === filter
  })

  return (
    <div style={s.container}>
      <div style={s.heading}>Dependency Graph</div>
      <div style={s.sub}>Visualise how skills, agents, hooks and commands relate</div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {Object.entries({ skill: 'Skills', agent: 'Agents', hook: 'Hooks', command: 'Commands' }).map(([type, label]) => (
          <div key={type} style={s.statCard}>
            <div style={{ fontSize: 24, fontWeight: 700, color: NODE_COLORS[type] }}>{counts[type] ?? 0}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
          </div>
        ))}
        <div style={s.statCard}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#e5e5e5' }}>{edges.length}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Edges</div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'skill', 'agent', 'hook', 'command'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ padding: '4px 14px', borderRadius: 20, background: filter === f ? (NODE_COLORS[f] ?? '#374151') : 'transparent', color: filter === f ? '#fff' : '#a3a3a3', border: `1px solid ${filter === f ? (NODE_COLORS[f] ?? '#374151') : '#374151'}`, cursor: 'pointer', fontSize: 12, textTransform: 'capitalize' as const }}
          >
            {f}
          </button>
        ))}
      </div>

      {nodes.length === 0 ? (
        <div style={s.card}>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            No nodes found. Skills, agents, hooks, and commands will appear here once created.
          </div>
        </div>
      ) : (
        <>
          {/* Node list */}
          <div style={s.card}>
            <div style={s.label}>Nodes ({filteredNodes.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {filteredNodes.map(node => (
                <span key={node.id} style={s.badge(NODE_COLORS[node.node_type] ?? '#6b7280')}>
                  {node.name}
                </span>
              ))}
            </div>
          </div>

          {/* Edge list */}
          {filteredEdges.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>Edges ({filteredEdges.length})</div>
              {filteredEdges.map(edge => {
                const src = nodes.find(n => n.id === edge.source)
                const tgt = nodes.find(n => n.id === edge.target)
                return (
                  <div key={edge.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #1f1f1f', fontSize: 13 }}>
                    <span style={s.badge(NODE_COLORS[src?.node_type ?? ''] ?? '#6b7280')}>{src?.name ?? edge.source}</span>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>→ {edge.edge_type} →</span>
                    <span style={s.badge(NODE_COLORS[tgt?.node_type ?? ''] ?? '#6b7280')}>{tgt?.name ?? edge.target}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
