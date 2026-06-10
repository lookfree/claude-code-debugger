import { useEffect, useState } from 'react'
import { api, CodexStatus, ProjectRow } from '../../../lib/tauri'

const S = {
  page: { padding: 24 },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e5e5e5' },
  card: {
    background: '#141414',
    border: '1px solid #262626',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, color: '#e5e5e5' },
  label: { color: '#6b7280', minWidth: 110, fontSize: 12 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3' },
  dot: (ok: boolean) => ({ color: ok ? '#22c55e' : '#ef4444', marginRight: 4 }),
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#1a3a2f', color: '#fff' },
  installGuide: {
    background: '#450a0a',
    border: '1px solid #b91c1c',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    color: '#fca5a5',
    fontSize: 13,
  },
  btn: {
    padding: '5px 12px',
    borderRadius: 4,
    border: '1px solid #374151',
    background: '#3b82f6',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    marginRight: 8,
  },
  btnSec: {
    padding: '5px 12px',
    borderRadius: 4,
    border: '1px solid #374151',
    background: 'transparent',
    color: '#a3a3a3',
    fontSize: 12,
    cursor: 'pointer',
    marginRight: 8,
  },
  table: { borderCollapse: 'collapse' as const, width: '100%' },
  th: { padding: '6px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, borderBottom: '1px solid #262626' },
  td: { padding: '8px 10px', fontSize: 13, color: '#e5e5e5', borderBottom: '1px solid #1f1f1f' },
  tdMono: { padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', color: '#a3a3a3', borderBottom: '1px solid #1f1f1f' },
}

interface Props {
  onNavigate?: (id: string) => void
}

export default function CodexOverview({ onNavigate }: Props) {
  const [status, setStatus] = useState<CodexStatus | null>(null)
  const [dashboard, setDashboard] = useState<{ codex_today_tokens: number } | null>(null)
  const [pinnedProjects, setPinnedProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.codex.getStatus(),
      api.usage.getDashboard(),
      api.usage.getProjects('codex-cli'),
    ])
      .then(([s, dash, projs]) => {
        setStatus(s)
        setDashboard(dash)
        setPinnedProjects(projs.filter((p) => p.pinned))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ ...S.page, color: '#6b7280' }}>加载中…</div>

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Codex CLI — Overview</h1>

      {/* 安装状态卡片 */}
      {status && !status.installed && (
        <div style={S.installGuide}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠ Codex CLI 未安装</div>
          <div style={{ marginBottom: 8 }}>请先安装 Codex CLI，然后重启 Forge 以刷新状态。</div>
          <div style={{ fontFamily: 'monospace', background: '#1a0a0a', padding: '8px 12px', borderRadius: 4, fontSize: 12 }}>
            npm install -g @openai/codex
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>
            安装后运行 <code>codex --version</code> 确认安装成功。
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>工具状态</div>
        {status && (
          <>
            <div style={S.row}>
              <span style={S.label}>安装状态</span>
              <span style={S.dot(status.installed)}>{status.installed ? '●' : '●'}</span>
              <span>{status.installed ? '已安装' : '未安装'}</span>
              {status.version && <span style={{ ...S.badge, marginLeft: 8 }}>{status.version}</span>}
            </div>
            {status.path && (
              <div style={S.row}>
                <span style={S.label}>路径</span>
                <span style={S.mono}>{status.path}</span>
              </div>
            )}
            <div style={S.row}>
              <span style={S.label}>配置文件</span>
              <span style={S.mono}>{status.config_path}</span>
              <span style={{ fontSize: 11, color: status.config_exists ? '#22c55e' : '#6b7280' }}>
                {status.config_exists ? '存在' : '不存在'}
              </span>
            </div>
            {status.current_model && (
              <div style={S.row}>
                <span style={S.label}>当前模型</span>
                <span style={S.mono}>{status.current_model}</span>
              </div>
            )}
            {status.current_provider && (
              <div style={S.row}>
                <span style={S.label}>当前 Provider</span>
                <span style={S.mono}>{status.current_provider}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 今日用量卡片 */}
      <div style={S.card}>
        <div style={S.cardTitle}>今日用量</div>
        <div style={S.row}>
          <span style={S.label}>Token 用量</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
            {dashboard ? (dashboard.codex_today_tokens / 1000).toFixed(1) + 'k' : '—'}
          </span>
        </div>
      </div>

      {/* 固定项目快捷启动 */}
      {pinnedProjects.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>固定项目</div>
          <table style={S.table}>
            <thead>
              <tr>
                {['目录', '会话数', '操作'].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pinnedProjects.map((p) => (
                <tr key={p.directory}>
                  <td style={S.tdMono}>{p.directory}</td>
                  <td style={S.td}>{p.session_count}</td>
                  <td style={S.td}>
                    <button
                      style={S.btn}
                      onClick={() => onNavigate?.('runner')}
                      title={`在 Runner 中启动 codex（目录: ${p.directory}）`}
                    >
                      启动
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 快捷导航 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={S.btn} onClick={() => onNavigate?.('codex_sessions')}>查看 Sessions</button>
        <button style={S.btn} onClick={() => onNavigate?.('codex_projects')}>查看 Projects</button>
        <button style={S.btnSec} onClick={() => onNavigate?.('codex_config')}>编辑配置文件</button>
      </div>
    </div>
  )
}
