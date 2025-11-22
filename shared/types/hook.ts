export type HookType =
  | 'pre-command'
  | 'post-command'
  | 'pre-commit'
  | 'post-commit'
  | 'pre-tool'
  | 'post-tool'

export type HookActionType =
  | 'validate'
  | 'transform'
  | 'notify'
  | 'block'
  | 'execute'

export interface HookConditions {
  commands?: string[]
  branches?: string[]
  filePatterns?: string[]
  tools?: string[]
  customCondition?: string // JS expression
}

export interface HookAction {
  type: HookActionType
  handler?: string
  command?: string
  timeout?: number
  continueOnError?: boolean
}

export interface Hook {
  name: string
  type: HookType
  enabled: boolean
  description: string
  pattern?: string // Glob pattern for matching
  conditions?: HookConditions
  actions: HookAction[]
  stopOnError?: boolean
  priority?: number // Lower number = higher priority
  filePath?: string
  location?: 'user' | 'project'
}

export interface HookExecution {
  id: string
  hookName: string
  trigger: string
  startTime: string
  endTime?: string
  status: 'running' | 'passed' | 'failed' | 'blocked'
  actions: HookActionExecution[]
}

export interface HookActionExecution {
  action: HookAction
  status: 'pending' | 'running' | 'passed' | 'failed'
  output?: string
  error?: string
  duration?: number
}
