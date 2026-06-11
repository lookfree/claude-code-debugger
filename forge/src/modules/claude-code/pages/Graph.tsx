import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api, Skill, HookEntry, McpServer, SlashCommand } from '../../../lib/tauri'

// ===== 移植自旧版 claude-code-debugger src/pages/Graph.tsx 的关系检测逻辑 =====

function extractKeywords(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/-service$/g, '')
    .replace(/-server$/g, '')
    .replace(/-skill$/g, '')
    .replace(/-session-start$/g, '')
    .replace(/-session-end$/g, '')
    .replace(/-hook$/g, '')
    .replace(/-command$/g, '')
    .replace(/^user-/g, '')
    .replace(/^project-/g, '')
  return cleaned.split(/[-_\s]+/).filter(w => w.length > 2)
}

function areRelated(name1: string, name2: string): boolean {
  const k1 = extractKeywords(name1)
  const k2 = extractKeywords(name2)
  return k1.some(a => k2.some(b => a === b || a.includes(b) || b.includes(a)))
}

function baseKeyword(name: string): string {
  return name
    .toLowerCase()
    .replace(/-service$/g, '')
    .replace(/-server$/g, '')
    .replace(/-skill$/g, '')
    .replace(/-session-start$/g, '')
    .replace(/-hook$/g, '')
    .replace(/-command$/g, '')
    .split(/[-_\s]+/)[0]
}

type NodeType = 'skill' | 'hook' | 'mcp' | 'command'
interface GNode { id: string; type: NodeType; label: string }
interface GEdge { id: string; source: string; target: string; label: string }

const NODE_COLORS: Record<NodeType, string> = {
  skill: '#3b82f6',
  hook: '#8b5cf6',
  mcp: '#10b981',
  command: '#f59e0b',
}
const NODE_TYPE_LABEL: Record<NodeType, string> = {
  skill: 'Skill',
  hook: 'Hook',
  mcp: 'MCP',
  command: 'Command',
}

const s = {
  container: { padding: 24, color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif', height: '100%', overflowY: 'auto' as const },
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: '#6b7280', marginBottom: 20 },
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 12 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 },
  statCard: (color: string) => ({ background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16, borderLeft: `3px solid ${color}` }),
  statNum: (color: string) => ({ fontSize: 24, fontWeight: 700, color }),
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  badge: (color: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: color + '22', color, fontSize: 11, border: `1px solid ${color}44` }),
  arrow: { color: '#6b7280', fontSize: 12, margin: '0 8px' },
  edgeLabel: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic' as const },
  chainCard: { background: 'linear-gradient(90deg, #16213a 0%, #1f1635 100%)', border: '1px solid #2c3e63', borderRadius: 8, padding: 16, marginBottom: 12 },
  chainStep: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 },
}

export default function Graph() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [hooks, setHooks] = useState<HookEntry[]>([])
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sk, hk, mcp, cmd] = await Promise.all([
        api.skills.getAll(),
        api.hooks.getAll(),
        api.mcp.getAll(),
        api.commands.getAll(),
      ])
      setSkills(sk)
      setHooks(hk)
      setMcpServers(mcp)
      setCommands(cmd)
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

  const { nodes, edges } = useMemo(() => {
    const nodes: GNode[] = [
      ...skills.map(x => ({ id: `skill-${x.name}`, type: 'skill' as const, label: x.name })),
      ...hooks.map(x => ({ id: `hook-${x.name}`, type: 'hook' as const, label: x.name })),
      ...mcpServers.map(x => ({ id: `mcp-${x.name}`, type: 'mcp' as const, label: x.name })),
      ...commands.map(x => ({ id: `command-${x.name}`, type: 'command' as const, label: x.name })),
    ]
    const edges: GEdge[] = []
    // 1. Skill → MCP（uses）
    for (const sk of skills) for (const m of mcpServers) {
      if (areRelated(sk.name, m.name)) edges.push({ id: `skill-${sk.name}->mcp-${m.name}`, source: `skill-${sk.name}`, target: `mcp-${m.name}`, label: 'uses' })
    }
    // 2. Hook → MCP（initializes）
    for (const h of hooks) for (const m of mcpServers) {
      if (areRelated(h.name, m.name)) edges.push({ id: `hook-${h.name}->mcp-${m.name}`, source: `hook-${h.name}`, target: `mcp-${m.name}`, label: 'initializes' })
    }
    // 3. Skill → Hook（configures）
    for (const sk of skills) for (const h of hooks) {
      if (areRelated(sk.name, h.name)) edges.push({ id: `skill-${sk.name}->hook-${h.name}`, source: `skill-${sk.name}`, target: `hook-${h.name}`, label: 'configures' })
    }
    // 4. Command → Skill（invokes）
    for (const c of commands) for (const sk of skills) {
      if (areRelated(c.name, sk.name)) edges.push({ id: `command-${c.name}->skill-${sk.name}`, source: `command-${c.name}`, target: `skill-${sk.name}`, label: 'invokes' })
    }
    // 5. Command → MCP（triggers）
    for (const c of commands) for (const m of mcpServers) {
      if (areRelated(c.name, m.name)) edges.push({ id: `command-${c.name}->mcp-${m.name}`, source: `command-${c.name}`, target: `mcp-${m.name}`, label: 'triggers' })
    }
    return { nodes, edges }
  }, [skills, hooks, mcpServers, commands])

  // 数据流向链：按基础关键词分组（移植旧版 chains 逻辑）
  const chains = useMemo(() => {
    const map = new Map<string, Map<string, GNode>>()
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    for (const e of edges) {
      const src = nodeById.get(e.source)
      const tgt = nodeById.get(e.target)
      if (!src || !tgt) continue
      const sKey = baseKeyword(src.label)
      const tKey = baseKeyword(tgt.label)
      const key = sKey === tKey ? sKey : `${sKey}-${tKey}`
      if (!map.has(key)) map.set(key, new Map())
      map.get(key)!.set(src.id, src)
      map.get(key)!.set(tgt.id, tgt)
    }
    // 至少包含 2 种类型的链才展示；按 hook → mcp → skill → command 顺序
    const order: NodeType[] = ['hook', 'mcp', 'skill', 'command']
    return Array.from(map.entries())
      .map(([key, m]) => ({
        key,
        members: Array.from(m.values()).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)),
      }))
      .filter(c => new Set(c.members.map(m => m.type)).size >= 2)
  }, [nodes, edges])

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>Building dependency graph...</div>
  }
  if (error) {
    return <div style={{ padding: 24, color: '#ef4444' }}>Error: {error}</div>
  }

  const nodeById = new Map(nodes.map(n => [n.id, n]))

  return (
    <div style={s.container}>
      <div style={s.heading}>Dependency Graph</div>
      <div style={s.sub}>Skills、Hooks、MCP Servers、Commands 的关联关系（基于命名关键词启发式检测）</div>

      {/* 统计卡 */}
      <div style={s.statGrid}>
        <div style={s.statCard(NODE_COLORS.skill)}><div style={s.statNum(NODE_COLORS.skill)}>{skills.length}</div><div style={s.statLabel}>Skills</div></div>
        <div style={s.statCard(NODE_COLORS.hook)}><div style={s.statNum(NODE_COLORS.hook)}>{hooks.length}</div><div style={s.statLabel}>Hooks</div></div>
        <div style={s.statCard(NODE_COLORS.mcp)}><div style={s.statNum(NODE_COLORS.mcp)}>{mcpServers.length}</div><div style={s.statLabel}>MCP Servers</div></div>
        <div style={s.statCard(NODE_COLORS.command)}><div style={s.statNum(NODE_COLORS.command)}>{commands.length}</div><div style={s.statLabel}>Commands</div></div>
        <div style={s.statCard('#e5e5e5')}><div style={s.statNum('#e5e5e5')}>{edges.length}</div><div style={s.statLabel}>Relationships</div></div>
      </div>

      {/* 数据流向与触发机制 */}
      <div style={s.card}>
        <div style={s.label}>数据流向与触发机制</div>
        {chains.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            未检测到跨类型的关联链。当 Skill / Hook / MCP / Command 的名称共享关键词时，这里会展示它们组成的工作流程。
          </div>
        ) : chains.map(chain => (
          <div key={chain.key} style={s.chainCard}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
              {chain.key.charAt(0).toUpperCase() + chain.key.slice(1)} 系统工作流程
            </div>
            {chain.members.map((m, i) => (
              <div key={m.id} style={s.chainStep}>
                <span style={{ color: '#6b7280', fontSize: 11, width: 16 }}>{i + 1}.</span>
                <span style={s.badge(NODE_COLORS[m.type])}>{NODE_TYPE_LABEL[m.type]}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.label}</span>
                {i < chain.members.length - 1 && <span style={s.arrow}>↓</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 关系明细 */}
      <div style={s.card}>
        <div style={s.label}>检测到的关系（{edges.length}）</div>
        {edges.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>暂无检测到的关系</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {edges.map(e => {
              const src = nodeById.get(e.source)
              const tgt = nodeById.get(e.target)
              if (!src || !tgt) return null
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                  <span style={s.badge(NODE_COLORS[src.type])}>{NODE_TYPE_LABEL[src.type]}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, marginLeft: 6 }}>{src.label}</span>
                  <span style={s.arrow}>—</span>
                  <span style={s.edgeLabel}>{e.label}</span>
                  <span style={s.arrow}>→</span>
                  <span style={s.badge(NODE_COLORS[tgt.type])}>{NODE_TYPE_LABEL[tgt.type]}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, marginLeft: 6 }}>{tgt.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 全部节点 */}
      <div style={s.card}>
        <div style={s.label}>全部节点（{nodes.length}）</div>
        {(['skill', 'hook', 'mcp', 'command'] as NodeType[]).map(t => {
          const group = nodes.filter(n => n.type === t)
          if (group.length === 0) return null
          return (
            <div key={t} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: NODE_COLORS[t], fontWeight: 600, marginBottom: 6 }}>
                {NODE_TYPE_LABEL[t]}（{group.length}）
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {group.map(n => (
                  <span key={n.id} style={s.badge(NODE_COLORS[t])}>{n.label}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
