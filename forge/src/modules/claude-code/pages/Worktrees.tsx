import { useState, useEffect } from 'react'
import { api, WorktreeInfo } from '../../../lib/tauri'

const s = {
  container: { padding: 24, color: '#e5e5e5', fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16, marginBottom: 12 },
  label: { fontSize: 12, color: '#6b7280', letterSpacing: 1 },
  btn: { padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnDanger: { padding: '6px 14px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  input: { background: '#1f1f1f', border: '1px solid #374151', borderRadius: 6, padding: '6px 12px', color: '#e5e5e5', fontSize: 13 },
}

export default function Worktrees() {
  const [repoPath, setRepoPath] = useState('')
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!repoPath) return
    try {
      setWorktrees(await api.worktrees.list(repoPath))
      setError(null)
    } catch (e) { setError(String(e)) }
  }

  useEffect(() => { load() }, [repoPath])

  const handleAdd = async () => {
    if (!newBranch.trim()) return
    try {
      await api.worktrees.add(repoPath, newBranch, '', true)
      setNewBranch('')
      await load()
    } catch (e) { setError(String(e)) }
  }

  const handleRemove = async (wt: WorktreeInfo) => {
    try {
      await api.worktrees.remove(repoPath, wt.path, false)
      await load()
    } catch (e) { setError(String(e)) }
  }

  return (
    <div style={s.container}>
      <div style={s.heading}>Worktrees</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={repoPath}
          onChange={e => setRepoPath(e.target.value)}
          placeholder="Repository path"
          style={{ ...s.input, flex: 1 }}
        />
      </div>
      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {worktrees.map(wt => (
        <div key={wt.path} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{wt.is_main ? 'Main worktree' : wt.branch}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>{wt.path}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Branch: {wt.branch}{wt.is_locked && <span style={{ color: '#f59e0b', marginLeft: 8 }}>locked</span>}</div>
            </div>
            {!wt.is_main && (
              <button style={s.btnDanger} onClick={() => handleRemove(wt)}>Remove</button>
            )}
          </div>
        </div>
      ))}
      <div style={{ ...s.card, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#6b7280', fontSize: 13 }}>+ New worktree</span>
        <input
          value={newBranch}
          onChange={e => setNewBranch(e.target.value)}
          placeholder="Branch name"
          style={{ ...s.input, flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button style={s.btn} onClick={handleAdd}>Create</button>
      </div>
    </div>
  )
}
