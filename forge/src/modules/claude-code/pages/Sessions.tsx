// forge/src/modules/claude-code/pages/Sessions.tsx
import { useEffect, useState } from 'react'
import { api, SessionRow } from '../../../lib/tauri'
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
}

function fmtTime(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function fmtDuration(sec: number | null): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtCost(usd: number): string {
  return usd > 0 ? `$${usd.toFixed(4)}` : '—'
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return `${n}`
}

interface SessionsProps {
  tool?: string
  onNavigate?: (id: string) => void
}

export default function Sessions({ tool = 'claude-code', onNavigate }: SessionsProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.usage.getSessions(tool, 50)
      setSessions(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.usage.sync()
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const handleResume = (sess: SessionRow) => {
    launchStore.set({
      tool: sess.tool,
      workingDir: sess.working_dir,
      extraArgs: sess.tool === 'claude-code' ? ['--resume', sess.id] : undefined,
    })
    onNavigate?.('runner')
  }

  useEffect(() => { load() }, [tool])

  const toolLabel = tool === 'claude-code' ? 'Claude Code' : 'Codex CLI'

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <div style={s.heading}>Sessions — {toolLabel}</div>
          <div style={s.sub}>{sessions.length} sessions loaded</div>
        </div>
        <button style={s.btn} onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>
      ) : sessions.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>No sessions found. Click Refresh to sync.</div>
      ) : sessions.map(sess => (
        <div key={sess.id} style={s.card}>
          <div style={s.row}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                <span style={s.mono}>{sess.working_dir || '—'}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {fmtTime(sess.started_at)}
                {sess.duration_sec ? ` · ${fmtDuration(sess.duration_sec)}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 13, color: '#a3a3a3' }}>
                {fmtTokens(sess.input_tokens + sess.output_tokens)} tokens
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{fmtCost(sess.cost_usd)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            {sess.model && <span style={s.badge}>{sess.model}</span>}
            <span style={s.badge}>in: {fmtTokens(sess.input_tokens)}</span>
            <span style={s.badge}>out: {fmtTokens(sess.output_tokens)}</span>
          </div>
          <div style={s.actions}>
            {onNavigate && (
              <button style={s.btnSm} onClick={() => handleResume(sess)}>
                {sess.tool === 'claude-code' ? '在 Runner 中恢复' : '在 Runner 启动'}
              </button>
            )}
            <button
              style={s.btnSm}
              onClick={() => { if (sess.working_dir) window.open(`file://${sess.working_dir}`) }}
            >
              打开目录
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
