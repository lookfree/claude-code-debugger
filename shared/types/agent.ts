export type AgentTriggerType = 'manual' | 'automatic' | 'scheduled'

export type AgentEvent =
  | 'on-session-start'
  | 'on-feature-complete'
  | 'on-refactor'
  | 'on-dependency-update'
  | 'on-commit'
  | 'on-error'

export interface AgentTrigger {
  type: AgentTriggerType
  events?: AgentEvent[]
  schedule?: string // cron expression
  conditions?: Record<string, unknown>
}

export interface AgentCapabilities {
  canModifyFiles: boolean
  canRunCommands: boolean
  canCommit: boolean
  scope: 'global' | 'project'
  allowedTools?: string[]
}

export type AgentSource = 'user' | 'project' | 'plugin'

export interface Agent {
  name: string
  type: 'subagent'
  description: string
  enabled: boolean
  /** @deprecated 旧自动化模型，新代码不填；保留避免编译破坏 */
  trigger?: AgentTrigger
  /** @deprecated 旧字段；subagent 用 systemPrompt */
  instructions?: string
  /** @deprecated 旧字段 */
  capabilities?: AgentCapabilities
  /** subagent 的 system prompt（.md frontmatter 之后的正文） */
  systemPrompt?: string
  /** 允许使用的 tool 列表（frontmatter tools，CSV/内联数组解析后）；空/缺省 = 继承全部 */
  tools?: string[]
  /** model override（frontmatter model），缺省 = 用会话默认模型 */
  model?: string
  interruptible?: boolean
  maxRuntime?: number // milliseconds
  dependencies?: string[]
  filePath?: string
  /** @deprecated 用 source；plugin→'user' 兼容映射 */
  location?: 'user' | 'project'
  /** 来源层 */
  source?: AgentSource
  /** 仅 plugin：所属 marketplace / plugin / 版本 / scope（复用 spec004 概念） */
  marketplace?: string
  pluginName?: string
  version?: string
  pluginScope?: 'user' | 'project'
  /** 同名被更高优先级来源覆盖时记录覆盖者 uid（user>project>plugin） */
  overriddenBy?: string
}

export interface AgentExecution {
  id: string
  agentName: string
  startTime: string
  endTime?: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  logs: AgentLog[]
  performance?: {
    duration: number
    tokensUsed?: number
    filesModified?: number
    commandsRun?: number
  }
}

export interface AgentLog {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: unknown
}
