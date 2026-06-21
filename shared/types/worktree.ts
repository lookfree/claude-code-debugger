import type { SettingsLevel } from './settings'

/** 后台会话隔离模式（2.1.143）；以官方枚举为准 */
export type WorktreeBgIsolation = 'none' | 'worktree'

export interface WorktreeConfig {
  /** worktree 基准 ref，如 'main' / 'origin/main'（2.1.133） */
  baseRef?: string
  /** 后台会话隔离模式（2.1.143） */
  bgIsolation?: WorktreeBgIsolation
  /** 每个字段来源层（来自 spec009 effective），UI 染色 */
  sources?: Partial<Record<'baseRef' | 'bgIsolation', SettingsLevel>>
}

/** bgIsolation 选项的展示元数据（驱动下拉 + 说明）。可扩展，新增官方枚举值同步加。 */
export const BG_ISOLATION_OPTIONS: Array<{ value: WorktreeBgIsolation; labelKey: string; hintKey: string }> = [
  { value: 'none', labelKey: 'worktree.isolation.none', hintKey: 'worktree.isolation.noneHint' },
  { value: 'worktree', labelKey: 'worktree.isolation.worktree', hintKey: 'worktree.isolation.worktreeHint' },
]
