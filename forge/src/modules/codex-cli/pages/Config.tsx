import { useEffect, useRef, useState } from 'react'
import { api } from '../../../lib/tauri'

const S = {
  page: { padding: 24, display: 'flex', flexDirection: 'column' as const, height: '100%', boxSizing: 'border-box' as const },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#e5e5e5' },
  subtitle: { fontSize: 12, color: '#6b7280', marginBottom: 16 },
  textarea: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    background: '#141414',
    border: '1px solid #262626',
    borderRadius: 6,
    color: '#e5e5e5',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 1.6,
    padding: 14,
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  footer: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 },
  btnSave: {
    padding: '7px 18px',
    borderRadius: 4,
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' as const },
  error: {
    padding: '8px 12px',
    borderRadius: 4,
    background: '#450a0a',
    border: '1px solid #b91c1c',
    color: '#fca5a5',
    fontSize: 12,
    marginTop: 8,
  },
  toast: {
    padding: '8px 12px',
    borderRadius: 4,
    background: '#14532d',
    border: '1px solid #16a34a',
    color: '#86efac',
    fontSize: 12,
  },
}

export default function CodexConfig() {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.codex.readConfig()
      .then((raw) => setContent(raw))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.codex.writeConfig(content)
      setSaved(true)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Codex CLI — 配置文件</h1>
      <p style={S.subtitle}>
        直接编辑 <code style={{ fontFamily: 'monospace' }}>~/.codex/config.toml</code>。保存时将校验 TOML 语法后原子写入。
        <br />
        注意：本编辑器为纯文本模式（刻意简化），未使用 Monaco Editor。
      </p>

      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>加载中…</div>
      ) : (
        <textarea
          style={S.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={'# ~/.codex/config.toml\n# 示例：\nmodel = "claude-sonnet-4-5"\nprovider = "anthropic"\n'}
          spellCheck={false}
        />
      )}

      {error && <div style={S.error}>{error}</div>}

      <div style={S.footer}>
        <button
          style={{ ...S.btnSave, ...(saving ? S.btnDisabled : {}) }}
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? '保存中…' : '保存'}
        </button>
        {saved && <div style={S.toast}>✓ 已保存</div>}
      </div>
    </div>
  )
}
