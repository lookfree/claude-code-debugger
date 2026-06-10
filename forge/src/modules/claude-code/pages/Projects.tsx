// forge/src/modules/claude-code/pages/Projects.tsx
import { useEffect, useState } from 'react'
import { api, ProjectRow } from '../../../lib/tauri'
import { launchStore } from '../../../lib/launchStore'

const s = {
  container: { padding: 24, color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif', height: '100%', overflow: 'auto' as const },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heading: { fontSize: 20, fontWeight: 700 },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  btn: { padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnSm: { padding: '4px 10px', background: '#1f2937', color: '#9ca3af', border: '1px solid #374151', borderRadius: 5, cursor: 'pointer', fontSize: 12 },
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: '14px 16px', marginBottom: 10 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: '#1f2937', color: '#9ca3af', fontSize: 11, border: '1px solid #374151', marginRight: 6 },
  actions: { display: 'flex', gap: 6, marginTop: 10 },
  pin: (pinned: boolean) => ({
    fontSize: 14,
    color: pinned ? '#f59e0b' : '#4b5563',
    cursor: 'pointer' as const,
    border: 'none',
    background: 'transparent',
    padding: '0 4px',
  }),
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return `${n}`
}

function fmtDate(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  const today = new Date()
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return `${diff}天前`
}

interface ProjectsProps {
  tool?: string
  onNavigate?: (id: string) => void
}

export default function Projects({ tool = 'claude-code', onNavigate }: ProjectsProps) {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.usage.getProjects(tool)
      setProjects(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handlePin = async (proj: ProjectRow) => {
    if (proj.pinned) {
      await api.usage.unpinProject(tool, proj.directory)
    } else {
      await api.usage.pinProject(tool, proj.directory)
    }
    await load()
  }

  const handleLaunch = (proj: ProjectRow) => {
    launchStore.set({ tool, workingDir: proj.directory })
    onNavigate?.('runner')
  }

  useEffect(() => { load() }, [tool])

  const toolLabel = tool === 'claude-code' ? 'Claude Code' : 'Codex CLI'

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <div style={s.heading}>Projects — {toolLabel}</div>
          <div style={s.sub}>{projects.length} projects</div>
        </div>
        <button style={s.btn} onClick={load} disabled={loading}>Refresh</button>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>
      ) : projects.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>No projects. Run a session first.</div>
      ) : projects.map(proj => (
        <div key={proj.id} style={s.card}>
          <div style={s.row}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <button style={s.pin(proj.pinned)} onClick={() => handlePin(proj)} title={proj.pinned ? '取消固定' : '固定'}>
                {proj.pinned ? '★' : '☆'}
              </button>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  <span style={s.mono}>{proj.directory}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  最后使用: {fmtDate(proj.last_used_at)} · {proj.session_count} 次会话
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 13, color: '#a3a3a3' }}>{fmtTokens(proj.total_tokens)} tokens</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {proj.total_cost_usd > 0 ? `$${proj.total_cost_usd.toFixed(4)}` : '—'}
              </div>
            </div>
          </div>
          <div style={s.actions}>
            {onNavigate && (
              <button style={s.btnSm} onClick={() => handleLaunch(proj)}>在 Runner 启动</button>
            )}
            <button
              style={s.btnSm}
              onClick={() => { if (proj.directory) window.open(`file://${proj.directory}`) }}
            >
              打开目录
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
