import { useState, useMemo } from 'react'
import claudeCodeData from '../data/claude-code.json'
import codexCliData from '../data/codex-cli.json'

interface CommandEntry {
  name: string
  type: 'slash' | 'flag' | 'subcommand'
  category: string
  description: string
  example?: string
}

const ALL_DATA: Record<string, CommandEntry[]> = {
  'claude-code': claudeCodeData as CommandEntry[],
  'codex-cli': codexCliData as CommandEntry[],
}

const TOOL_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
}

type CopiedKey = string | null

const S = {
  page: { padding: 24 },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e5e5e5' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  tab: (active: boolean) => ({
    padding: '6px 16px',
    borderRadius: 20,
    border: `1px solid ${active ? '#3b82f6' : '#374151'}`,
    background: active ? '#1e3a5f' : 'transparent',
    color: active ? '#3b82f6' : '#a3a3a3',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
  }),
  searchInput: {
    flex: 1,
    maxWidth: 300,
    padding: '6px 12px',
    background: '#141414',
    border: '1px solid #262626',
    borderRadius: 6,
    color: '#e5e5e5',
    fontSize: 13,
    outline: 'none',
  },
  categoryHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    padding: '14px 0 6px',
    borderBottom: '1px solid #1f1f1f',
    marginBottom: 4,
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 0,
    padding: '8px 0',
    borderBottom: '1px solid #141414',
    cursor: 'pointer',
    borderRadius: 4,
  },
  rowHover: { background: '#141414' },
  nameCell: {
    minWidth: 220,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#60a5fa',
    fontWeight: 600,
    paddingRight: 16,
  },
  descCell: {
    flex: 1,
    fontSize: 13,
    color: '#d1d5db',
    lineHeight: 1.5,
  },
  typeBadge: (type: string) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      slash: { bg: '#1e3a5f', fg: '#60a5fa' },
      flag: { bg: '#3f1f4a', fg: '#c084fc' },
      subcommand: { bg: '#1a3a2f', fg: '#4ade80' },
    }
    const c = colors[type] || { bg: '#262626', fg: '#a3a3a3' }
    return {
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
      marginRight: 12,
      minWidth: 72,
      textAlign: 'center' as const,
    }
  },
  example: { fontFamily: 'monospace', fontSize: 11, color: '#6b7280', marginTop: 2 },
  copiedFeedback: { fontSize: 11, color: '#22c55e', marginLeft: 8 },
  noResults: { color: '#6b7280', fontSize: 13, padding: '24px 0', textAlign: 'center' as const },
  count: { fontSize: 11, color: '#6b7280', marginLeft: 'auto' },
}

function fuzzyMatch(entry: CommandEntry, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q) ||
    (entry.example?.toLowerCase().includes(q) ?? false)
  )
}

function groupByCategory(entries: CommandEntry[]): Map<string, CommandEntry[]> {
  const map = new Map<string, CommandEntry[]>()
  for (const e of entries) {
    if (!map.has(e.category)) map.set(e.category, [])
    map.get(e.category)!.push(e)
  }
  return map
}

export default function CommandRef() {
  const [tool, setTool] = useState<'claude-code' | 'codex-cli'>('claude-code')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<CopiedKey>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return ALL_DATA[tool].filter((e) => fuzzyMatch(e, query))
  }, [tool, query])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])

  const handleCopy = async (entry: CommandEntry) => {
    const text = entry.example ?? entry.name
    try {
      await navigator.clipboard.writeText(text)
      setCopied(entry.name)
      setTimeout(() => setCopied((prev) => (prev === entry.name ? null : prev)), 2000)
    } catch {
      // clipboard not available in some sandboxed environments
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Command Ref — 命令速查</h1>

      <div style={S.toolbar}>
        {Object.keys(ALL_DATA).map((t) => (
          <button
            key={t}
            style={S.tab(t === tool)}
            onClick={() => { setTool(t as 'claude-code' | 'codex-cli'); setQuery('') }}
          >
            {TOOL_LABELS[t]}
          </button>
        ))}
        <input
          style={S.searchInput}
          placeholder="搜索命令名称或描述…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span style={S.count}>{filtered.length} 条</span>
      </div>

      {filtered.length === 0 && (
        <div style={S.noResults}>未找到匹配的命令</div>
      )}

      {Array.from(grouped.entries()).map(([category, entries]) => (
        <div key={category}>
          <div style={S.categoryHeader}>{category}</div>
          {entries.map((entry) => {
            const isHovered = hoveredRow === entry.name
            return (
              <div
                key={entry.name}
                style={{ ...S.row, ...(isHovered ? S.rowHover : {}) }}
                onClick={() => handleCopy(entry)}
                onMouseEnter={() => setHoveredRow(entry.name)}
                onMouseLeave={() => setHoveredRow(null)}
                title={`点击复制: ${entry.example ?? entry.name}`}
              >
                <span style={S.nameCell}>{entry.name}</span>
                <span style={S.typeBadge(entry.type)}>{entry.type}</span>
                <span style={S.descCell}>
                  {entry.description}
                  {entry.example && (
                    <div style={S.example}>{entry.example}</div>
                  )}
                </span>
                {copied === entry.name && (
                  <span style={S.copiedFeedback}>✓ 已复制</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
