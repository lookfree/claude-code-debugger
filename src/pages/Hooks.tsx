import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { Hook, HookType, HookExecutionLog, HookAction, HookSettingsMatcher } from '@shared/types'
import { HookActionForm, makeEmptyAction } from './hooks/HookActionForm'
import type { HookActionItem } from './hooks/HookActionForm'
import { HookTypePanels } from './hooks/HookTypePanels'
import type { HookTypeFields } from './hooks/HookTypePanels'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Search,
  Webhook,
  Globe,
  FolderOpen,
  Terminal,
  Code,
  Zap,
  ArrowRight,
  FileCode,
  HelpCircle,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  AlertCircle,
  Check,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  History,
  Timer,
  Bug,
  Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Hook event types grouped by domain for the Select dropdown.
const HOOK_TYPE_GROUPS: Array<{ group: string; types: HookType[] }> = [
  { group: 'tool', types: ['PreToolUse', 'PostToolUse', 'MessageDisplay'] },
  {
    group: 'session',
    types: ['SessionStart', 'SessionEnd', 'PostSession', 'UserPromptSubmit', 'Notification'],
  },
  { group: 'lifecycle', types: ['Stop', 'StopFailure', 'SubagentStart', 'SubagentStop'] },
  { group: 'compaction', types: ['PreCompact', 'PostCompact'] },
  { group: 'audit', types: ['ConfigChange'] },
  {
    group: 'interaction',
    types: ['Elicitation', 'ElicitationResult', 'PermissionRequest'],
  },
]

const HOOK_TYPES: HookType[] = HOOK_TYPE_GROUPS.flatMap((g) => g.types)

export default function Hooks() {
  const { t } = useTranslation('hooks')
  const [hooks, setHooks] = useState<Hook[]>([])
  const [selectedHook, setSelectedHook] = useState<Hook | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editForm, setEditForm] = useState<{
    name: string
    type: HookType
    description: string
    enabled: boolean
    location: 'user' | 'project'
    projectPath: string
    priority: number
    stopOnError: boolean
    pattern: string
    // Claude Code native format fields
    matcher: string
    matcherIndex?: number // Index of the hook in settings.json for editing
    actions: HookActionItem[]
    // Type-specific matcher-level fields
    reloadSkills: boolean // SessionStart
    sessionTitle: string // SessionStart
    maxBlocks: number // Stop / StopFailure
    replaceToolOutput: boolean // PostToolUse
    effort?: Hook['effort'] // read-only display
  }>({
    name: '',
    type: 'SessionStart',
    description: '',
    enabled: true,
    location: 'user',
    projectPath: '',
    priority: 100,
    stopOnError: false,
    pattern: '',
    matcher: '',
    matcherIndex: undefined,
    actions: [makeEmptyAction()],
    reloadSkills: false,
    sessionTitle: '',
    maxBlocks: 8,
    replaceToolOutput: false,
    effort: undefined,
  })
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Execution logs state
  const [executionLogs, setExecutionLogs] = useState<HookExecutionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<HookExecutionLog | null>(null)

  // Debug session state
  const [debugSessionPid, setDebugSessionPid] = useState<number | null>(null)
  const [debugSessionRunning, setDebugSessionRunning] = useState(false)
  const [debugSessionMessage, setDebugSessionMessage] = useState<string>('')

  useEffect(() => {
    loadHooks()
    loadExecutionLogs()
  }, [])

  const loadExecutionLogs = useCallback(async () => {
    try {
      setLogsLoading(true)
      // Load both manual test logs and real Claude Code debug logs
      const [manualLogs, debugLogs] = await Promise.all([
        api.hooks.getLogs(),
        api.hooks.getDebugLogs(),
      ])
      // Merge and sort by timestamp (newest first)
      const allLogs = [...manualLogs, ...debugLogs].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      setExecutionLogs(allLogs)
      console.log('[Hooks Page] Loaded', manualLogs.length, 'manual logs and', debugLogs.length, 'debug logs')
    } catch (error) {
      console.error('[Hooks Page] Failed to load execution logs:', error)
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const clearExecutionLogs = async () => {
    try {
      await api.hooks.clearLogs()
      setExecutionLogs([])
      setSelectedLog(null)
    } catch (error) {
      console.error('[Hooks Page] Failed to clear execution logs:', error)
    }
  }

  // Launch Claude Code in debug mode
  const launchDebugSession = async (hook: Hook) => {
    if (debugSessionRunning) {
      alert(t('logs.sessionAlreadyRunning', 'A debug session is already running'))
      return
    }

    setDebugSessionRunning(true)
    setDebugSessionMessage(t('logs.startingDebugSession', 'Starting Claude Code in debug mode...'))

    try {
      // Extract project path from hook if it's a project hook
      let projectPath: string | undefined
      if (hook.location === 'project' && hook.filePath) {
        const match = hook.filePath.match(/^(.+)\/\.claude\//)
        if (match) {
          projectPath = match[1]
        }
      }

      const result = await api.hooks.launchDebugSession(hook.type, projectPath)

      if (result.success) {
        setDebugSessionPid(result.pid || null)
        setDebugSessionMessage(result.message)

        // Wait for session to auto-terminate (30s) then refresh logs
        // Claude Code writes debug logs after session ends
        setTimeout(async () => {
          setDebugSessionRunning(false)
          setDebugSessionPid(null)
          setDebugSessionMessage(t('logs.sessionEnded', 'Debug session ended. Loading logs...'))
          // Wait a bit for logs to be written
          await new Promise(resolve => setTimeout(resolve, 2000))
          await loadExecutionLogs()
          setDebugSessionMessage(t('logs.logsLoaded', 'Logs loaded successfully'))
        }, 32000)
      } else {
        setDebugSessionMessage(result.message)
        setDebugSessionRunning(false)
      }
    } catch (error) {
      console.error('[Hooks Page] Failed to launch debug session:', error)
      setDebugSessionMessage(t('logs.launchFailed', 'Failed to start debug session') + ': ' + (error as Error).message)
      setDebugSessionRunning(false)
    }
  }

  // Stop debug session manually
  const stopDebugSession = async () => {
    if (!debugSessionPid) return

    try {
      await api.hooks.stopDebugSession(debugSessionPid)
      setDebugSessionRunning(false)
      setDebugSessionPid(null)
      setDebugSessionMessage(t('logs.sessionStopped', 'Debug session stopped. Loading logs...'))
      // Wait for logs to be written before refreshing
      await new Promise(resolve => setTimeout(resolve, 2000))
      await loadExecutionLogs()
      setDebugSessionMessage(t('logs.logsLoaded', 'Logs loaded successfully'))
    } catch (error) {
      console.error('[Hooks Page] Failed to stop debug session:', error)
    }
  }

  const loadHooks = async () => {
    try {
      console.log('[Hooks Page] Loading hooks...')
      setLoading(true)
      const data = await api.hooks.getAll()
      console.log('[Hooks Page] Loaded', data.length, 'hooks with matcherIndex:', data.map(h => ({ name: h.name, matcherIndex: h.matcherIndex })))
      setHooks(data)

      // Update selectedHook with fresh data (including matcherIndex)
      if (selectedHook) {
        const updated = data.find(h => h.name === selectedHook.name && h.type === selectedHook.type)
        if (updated) {
          console.log('[Hooks Page] Updating selectedHook with fresh data, matcherIndex:', updated.matcherIndex)
          setSelectedHook(updated)
        }
      } else if (data.length > 0) {
        setSelectedHook(data[0])
      }
    } catch (error) {
      console.error('[Hooks Page] Failed to load hooks:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredHooks = hooks.filter((hook) =>
    hook.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hook.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleEdit = async (hook: Hook) => {
    console.log('[Hooks Page] handleEdit called with hook:', hook.name, 'matcherIndex:', hook.matcherIndex)
    let projectPath = ''
    if (hook.filePath && hook.location === 'project') {
      const match = hook.filePath.match(/^(.+)\/\.claude\//)
      if (match) {
        projectPath = match[1]
      }
    }

    // Convert domain HookActions into the editing model
    const actions: HookActionItem[] = (hook.actions?.length ? hook.actions : []).map((action) => {
      const item = makeEmptyAction()
      // Map legacy abstract verbs to command, http/prompt stay as-is
      const rawType = action.type
      item.type = rawType === 'http' || rawType === 'prompt' ? rawType : 'command'
      item.timeout = action.timeout ?? 60000
      item.continueOnError = action.continueOnError ?? false
      item.continueOnBlock = action.continueOnBlock ?? false
      item.terminalSequence = action.terminalSequence ?? ''

      if (item.type === 'command') {
        const cmd = action.command || action.handler || ''
        const isScript = cmd.endsWith('.sh') || cmd.startsWith('.claude/hooks/')
        item.command = cmd
        item.useScriptFile = isScript
        item.scriptPath = isScript ? cmd : ''
        item.args = action.args ? [...action.args] : []
      } else if (item.type === 'http') {
        item.url = action.url ?? ''
        item.method = action.method ?? 'POST'
        item.headers = action.headers
          ? Object.entries(action.headers).map(([key, value]) => ({ key, value }))
          : []
        item.body = action.body ?? ''
      } else if (item.type === 'prompt') {
        item.prompt = action.prompt ?? ''
      }
      return item
    })
    if (actions.length === 0) actions.push(makeEmptyAction())

    // Load script content for each script file
    for (const item of actions) {
      if (item.type === 'command' && item.useScriptFile && item.scriptPath) {
        try {
          const content = await api.hooks.readScript(item.scriptPath, hook.location || 'user', projectPath || undefined)
          if (content) item.scriptContent = content
        } catch (error) {
          console.error('[Hooks Page] Failed to read script content:', error)
        }
      }
    }

    setEditForm({
      name: hook.name,
      type: hook.type,
      description: hook.description || '',
      enabled: hook.enabled,
      location: hook.location || 'user',
      projectPath,
      priority: hook.priority || 100,
      stopOnError: hook.stopOnError || false,
      pattern: hook.pattern || '',
      matcher: hook.pattern || '',
      matcherIndex: hook.matcherIndex, // Track the index for updating
      actions,
      reloadSkills: hook.sessionStart?.reloadSkills ?? false,
      sessionTitle: hook.sessionStart?.sessionTitle ?? '',
      maxBlocks: hook.maxBlocks ?? 8,
      replaceToolOutput: hook.replaceToolOutput ?? false,
      effort: hook.effort,
    })
    setIsEditing(true)
    setIsCreating(false)
  }

  const handleCreate = () => {
    setEditForm({
      name: '',
      type: 'SessionStart',
      description: '',
      enabled: true,
      location: 'user',
      projectPath: '',
      priority: 100,
      stopOnError: false,
      pattern: '',
      matcher: '',
      matcherIndex: undefined,
      actions: [makeEmptyAction()],
      reloadSkills: false,
      sessionTitle: '',
      maxBlocks: 8,
      replaceToolOutput: false,
      effort: undefined,
    })
    setIsCreating(true)
    setIsEditing(false)
  }

  const handleSelectProjectPath = async () => {
    try {
      const path = await api.project.selectPath()
      if (path) {
        setEditForm({ ...editForm, projectPath: path })
      }
    } catch (error) {
      console.error('[Hooks Page] Failed to select project path:', error)
    }
  }

  // Convert an editing action item into a domain HookAction
  // 单一来源：preview 与保存都用它构建 HookSettingsMatcher，避免序列化逻辑分叉
  const buildHookConfig = (actions: HookActionItem[]): HookSettingsMatcher => {
    const cfg: HookSettingsMatcher = {
      matcher: editForm.matcher || undefined,
      hooks: actions.map(actionItemToDomain),
    }
    if (editForm.type === 'SessionStart') {
      if (editForm.reloadSkills) cfg.reloadSkills = true
      if (editForm.sessionTitle.trim()) cfg.sessionTitle = editForm.sessionTitle.trim()
    }
    if (editForm.type === 'PostToolUse' && editForm.replaceToolOutput) cfg.replaceToolOutput = true
    // 仅在偏离默认 8 时写 maxBlocks，避免给每个 Stop hook 注入冗余的默认值
    if ((editForm.type === 'Stop' || editForm.type === 'StopFailure') && editForm.maxBlocks !== 8) {
      cfg.maxBlocks = editForm.maxBlocks
    }
    return cfg
  }

  const actionItemToDomain = (item: HookActionItem): HookAction => {
    const base: HookAction = {
      type: item.type,
      timeout: item.timeout,
      continueOnError: item.continueOnError || undefined,
      continueOnBlock: item.continueOnBlock || undefined,
      terminalSequence: item.terminalSequence.trim() || undefined,
    }
    if (item.type === 'command') {
      const commandValue = item.useScriptFile ? item.scriptPath : item.command
      if (commandValue.trim()) base.command = commandValue
      if (item.args.some((a) => a.trim())) base.args = item.args.filter((a) => a.trim())
    } else if (item.type === 'http') {
      base.url = item.url.trim() || undefined
      base.method = item.method
      const headerEntries = item.headers.filter((h) => h.key.trim())
      if (headerEntries.length > 0) {
        base.headers = Object.fromEntries(headerEntries.map((h) => [h.key.trim(), h.value]))
      }
      if (item.body.trim()) base.body = item.body
    } else if (item.type === 'prompt') {
      if (item.prompt.trim()) base.prompt = item.prompt
    }
    return base
  }

  const handleSave = async () => {
    const errors: string[] = []

    // Validate hook type
    if (!editForm.type || !HOOK_TYPES.includes(editForm.type)) {
      errors.push(t('errors.typeRequired'))
    }

    // Keep actions that have meaningful content for their type
    const validActions = editForm.actions.filter((item) => {
      if (item.type === 'command') {
        if (item.useScriptFile) return item.scriptPath.trim() && item.scriptContent.trim()
        return item.command.trim() || item.args.some((a) => a.trim())
      }
      if (item.type === 'http') return item.url.trim()
      if (item.type === 'prompt') return item.prompt.trim()
      return false
    })
    if (validActions.length === 0) {
      errors.push(t('errors.actionsRequired'))
    }

    // Validate project path for project hooks
    if (editForm.location === 'project' && !editForm.projectPath) {
      errors.push(t('errors.projectPathRequired'))
    }

    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    const hookConfig = buildHookConfig(validActions)

    // Backend ajv validation before saving（用与保存完全相同的 actions，避免双校验对象分叉）
    try {
      const synthesized: Hook = {
        name: editForm.name,
        type: editForm.type,
        enabled: true,
        description: editForm.description,
        actions: hookConfig.hooks,
      }
      const result = await api.hooks.validateHook(synthesized)
      if (!result.valid) {
        setValidationErrors(result.errors)
        return
      }
    } catch (error) {
      setValidationErrors([(error as Error).message])
      return
    }

    setValidationErrors([])
    setSaving(true)
    try {
      // First, create script files if needed
      for (const item of validActions) {
        if (item.type === 'command' && item.useScriptFile && item.scriptPath && item.scriptContent) {
          console.log('[Hooks Page] Creating script file:', item.scriptPath)
          await api.hooks.createScript(
            item.scriptPath,
            item.scriptContent,
            editForm.location,
            editForm.projectPath || undefined
          )
        }
      }

      // When editing, pass matcherIndex to update instead of adding new
      const matcherIndexToUse = isEditing ? editForm.matcherIndex : undefined
      console.log('[Hooks Page] Saving hook to settings:', editForm.type, hookConfig, 'matcherIndex:', matcherIndexToUse)
      await api.hooks.saveToSettings(
        editForm.type,
        hookConfig,
        editForm.location,
        editForm.projectPath || undefined,
        matcherIndexToUse
      )

      const updatedHooks = await api.hooks.getAll()
      setHooks(updatedHooks)

      // Try to find and select the newly created hook
      const newHook = updatedHooks.find((h) =>
        h.type === editForm.type &&
        h.pattern === (editForm.matcher || '')
      )
      if (newHook) setSelectedHook(newHook)

      setIsEditing(false)
      setIsCreating(false)
      setValidationErrors([])
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('[Hooks Page] Failed to save hook:', error)
      alert(t('errors.saveFailed') + ': ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedHook) return

    try {
      console.log('[Hooks Page] Deleting hook:', selectedHook.name, 'matcherIndex:', selectedHook.matcherIndex)

      // If hook has matcherIndex, use deleteFromSettings (for settings.json hooks)
      // Otherwise fall back to the legacy delete method
      if (selectedHook.matcherIndex !== undefined) {
        // Get project path from filePath if it's a project hook
        let projectPath: string | undefined
        if (selectedHook.location === 'project' && selectedHook.filePath) {
          const match = selectedHook.filePath.match(/^(.+)\/\.claude\//)
          if (match) {
            projectPath = match[1]
          }
        }

        await api.hooks.deleteFromSettings(
          selectedHook.type,
          selectedHook.matcherIndex,
          selectedHook.location || 'user',
          projectPath
        )
      } else {
        // Legacy hooks stored as separate JSON files
        await api.hooks.delete(selectedHook.name)
      }

      setDeleteDialogOpen(false)
      setSelectedHook(null)
      await loadHooks()
    } catch (error) {
      console.error('[Hooks Page] Failed to delete hook:', error)
      alert(t('errors.deleteFailed') + ': ' + (error as Error).message)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setIsCreating(false)
    setValidationErrors([])
  }

  const userHooks = filteredHooks.filter((h) => h.location === 'user')
  const projectHooks = filteredHooks.filter((h) => h.location === 'project')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">{t('loading')}</div>
          <div className="text-muted-foreground">{t('common:pleaseWait', 'Please wait')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left Sidebar - Hooks List */}
      <div className="w-80 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Create Button */}
        <Button onClick={handleCreate} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          {t('newHook')}
        </Button>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t('stats.userHooks')}
              </CardTitle>
              <div className="text-2xl font-bold">{userHooks.length}</div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                {t('stats.projectHooks')}
              </CardTitle>
              <div className="text-2xl font-bold">{projectHooks.length}</div>
            </CardHeader>
          </Card>
        </div>

        {/* Hooks List */}
        <div className="flex-1 overflow-auto space-y-2">
          {filteredHooks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {searchQuery ? t('noSearchResults') : (
                  <>
                    <p>{t('noHooks')}</p>
                    <p className="text-sm mt-2">{t('noHooksHint')}</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredHooks.map((hook) => (
              <Card
                key={hook.filePath || hook.name}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary',
                  selectedHook?.name === hook.name && 'border-primary bg-accent'
                )}
                onClick={() => setSelectedHook(hook)}
              >
                <CardHeader className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Webhook className="h-4 w-4 shrink-0" />
                        <span className="truncate">{hook.name}</span>
                      </CardTitle>
                      {hook.description && (
                        <CardDescription className="text-sm mt-1 line-clamp-2">
                          {hook.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant={hook.location === 'user' ? 'default' : 'secondary'}>
                      {hook.location === 'user' ? (
                        <><Globe className="h-3 w-3 mr-1" /> {t('user')}</>
                      ) : (
                        <><FolderOpen className="h-3 w-3 mr-1" /> {t('project')}</>
                      )}
                    </Badge>
                    <Badge variant="outline">{hook.type}</Badge>
                    {hook.enabled ? (
                      <Badge variant="outline" className="text-green-600">{t('enabled')}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600">{t('disabled')}</Badge>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>

        {/* Info Box */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">{t('aboutHooks')}</h4>
            <p className="text-xs text-muted-foreground">{t('aboutHooksDesc')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Hook Details */}
      <div className="flex-1 overflow-auto">
        {selectedHook ? (
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Webhook className="h-6 w-6" />
                    {selectedHook.name}
                  </CardTitle>
                  {selectedHook.description && (
                    <CardDescription className="mt-2">{selectedHook.description}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(selectedHook)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    {t('edit')}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t('delete')}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mt-4 flex-wrap">
                <Badge variant={selectedHook.location === 'user' ? 'default' : 'secondary'}>
                  {selectedHook.location === 'user' ? t('user') : t('project')}
                </Badge>
                <Badge variant="outline">{selectedHook.type}</Badge>
                {selectedHook.enabled ? (
                  <Badge variant="outline" className="text-green-600">{t('enabled')}</Badge>
                ) : (
                  <Badge variant="outline" className="text-red-600">{t('disabled')}</Badge>
                )}
                {selectedHook.priority && (
                  <Badge variant="outline">Priority: {selectedHook.priority}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="details" className="w-full">
                <TabsList>
                  <TabsTrigger value="details">{t('tabs.details')}</TabsTrigger>
                  <TabsTrigger value="actions">{t('tabs.actions')}</TabsTrigger>
                  <TabsTrigger value="config">{t('tabs.config')}</TabsTrigger>
                  <TabsTrigger value="logs">{t('tabs.logs')}</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4 mt-4">
                  {/* Hook Flow Visualization */}
                  <Card className="border-2">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        {t('flow.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-4 p-4 bg-muted rounded-lg">
                        <div className="flex-1 text-center">
                          <div className="flex justify-center mb-2">
                            <Terminal className="h-8 w-8 text-blue-500" />
                          </div>
                          <p className="font-semibold text-sm">{t(`events.${selectedHook.type}.title`, selectedHook.type)}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t('flow.eventTriggered')}</p>
                        </div>

                        <ArrowRight className="h-6 w-6 text-muted-foreground" />

                        <div className="flex-1 text-center">
                          <div className="flex justify-center mb-2">
                            <Webhook className="h-8 w-8 text-purple-500" />
                          </div>
                          <p className="font-semibold text-sm">{t('flow.hookExecutes')}</p>
                          <p className="text-xs text-muted-foreground mt-1">{selectedHook.name}</p>
                        </div>

                        <ArrowRight className="h-6 w-6 text-muted-foreground" />

                        <div className="flex-1 text-center">
                          <div className="flex justify-center mb-2">
                            <Code className="h-8 w-8 text-green-500" />
                          </div>
                          <p className="font-semibold text-sm">{t('flow.actionsRun')}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {selectedHook.actions?.length || 0} action(s)
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pattern */}
                  {selectedHook.pattern && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">{t('details.pattern')}</h3>
                      <div className="bg-muted rounded-lg p-4">
                        <p className="text-sm font-mono">{selectedHook.pattern}</p>
                      </div>
                    </div>
                  )}

                  {/* Conditions */}
                  {selectedHook.conditions && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">{t('details.conditions')}</h3>
                      <div className="bg-muted rounded-lg p-4 space-y-2">
                        {selectedHook.conditions.commands && (
                          <div>
                            <span className="text-xs text-muted-foreground">{t('details.commands')}:</span>
                            <p className="text-sm font-mono">{selectedHook.conditions.commands.join(', ')}</p>
                          </div>
                        )}
                        {selectedHook.conditions.branches && (
                          <div>
                            <span className="text-xs text-muted-foreground">{t('details.branches')}:</span>
                            <p className="text-sm font-mono">{selectedHook.conditions.branches.join(', ')}</p>
                          </div>
                        )}
                        {selectedHook.conditions.filePatterns && (
                          <div>
                            <span className="text-xs text-muted-foreground">{t('details.filePatterns')}:</span>
                            <p className="text-sm font-mono">{selectedHook.conditions.filePatterns.join(', ')}</p>
                          </div>
                        )}
                        {selectedHook.conditions.tools && (
                          <div>
                            <span className="text-xs text-muted-foreground">{t('details.tools')}:</span>
                            <p className="text-sm font-mono">{selectedHook.conditions.tools.join(', ')}</p>
                          </div>
                        )}
                        {selectedHook.conditions.customCondition && (
                          <div>
                            <span className="text-xs text-muted-foreground">{t('details.customCondition')}:</span>
                            <p className="text-sm font-mono">{selectedHook.conditions.customCondition}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* File Path */}
                  {selectedHook.filePath && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <FileCode className="h-4 w-4" />
                        {t('details.filePath')}
                      </h3>
                      <div className="bg-muted rounded-lg p-4">
                        <p className="text-sm font-mono break-all">{selectedHook.filePath}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="actions" className="space-y-4 mt-4">
                  <h3 className="text-lg font-semibold">{t('actions.title')}</h3>
                  {selectedHook.actions && selectedHook.actions.length > 0 ? (
                    <div className="space-y-4">
                      {selectedHook.actions.map((action, index) => (
                        <Card key={index}>
                          <CardHeader className="p-4">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Badge variant="outline">
                                {t(`actions.types.${action.type}`, action.type)}
                              </Badge>
                              <span className="text-muted-foreground text-sm">
                                Action {index + 1}
                              </span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 pt-0 space-y-2">
                            {action.handler && (
                              <div>
                                <span className="text-xs text-muted-foreground">{t('actions.handler')}:</span>
                                <p className="text-sm font-mono">{action.handler}</p>
                              </div>
                            )}
                            {action.command && (
                              <div>
                                <span className="text-xs text-muted-foreground">{t('actions.command')}:</span>
                                <p className="text-sm font-mono">{action.command}</p>
                              </div>
                            )}
                            {action.timeout && (
                              <div>
                                <span className="text-xs text-muted-foreground">{t('actions.timeout')}:</span>
                                <p className="text-sm">{action.timeout}ms</p>
                              </div>
                            )}
                            <div>
                              <span className="text-xs text-muted-foreground">{t('actions.continueOnError')}:</span>
                              <p className="text-sm">{action.continueOnError ? t('actions.yes') : t('actions.no')}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No actions defined</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="config" className="space-y-4 mt-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="text-sm font-semibold mb-3">Hook Configuration (JSON)</h3>
                    <pre className="text-xs font-mono bg-background p-3 rounded overflow-auto max-h-96">
                      {JSON.stringify(
                        {
                          name: selectedHook.name,
                          type: selectedHook.type,
                          enabled: selectedHook.enabled,
                          description: selectedHook.description,
                          pattern: selectedHook.pattern,
                          conditions: selectedHook.conditions,
                          actions: selectedHook.actions,
                          stopOnError: selectedHook.stopOnError,
                          priority: selectedHook.priority,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <HelpCircle className="h-4 w-4" />
                      {t('howToCreate.title')}
                    </h3>
                    <ol className="text-sm space-y-2 mt-3">
                      <li className="flex gap-2">
                        <span className="font-semibold">1.</span>
                        <span>{t('howToCreate.step1')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-semibold">2.</span>
                        <span>{t('howToCreate.step2')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-semibold">3.</span>
                        <span>{t('howToCreate.step3')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-semibold">4.</span>
                        <span>{t('howToCreate.step4')}</span>
                      </li>
                    </ol>
                  </div>
                </TabsContent>

                <TabsContent value="logs" className="space-y-4 mt-4">
                  {/* Test Button and Actions */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <History className="h-5 w-5" />
                      {t('logs.title')}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadExecutionLogs}
                        disabled={logsLoading}
                      >
                        <RefreshCw className={cn("h-4 w-4 mr-1", logsLoading && "animate-spin")} />
                        {t('logs.refresh')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearExecutionLogs}
                        disabled={executionLogs.length === 0}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('logs.clear')}
                      </Button>
                      {/* Debug Session Button */}
                      {debugSessionRunning ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={stopDebugSession}
                        >
                          <Square className="h-4 w-4 mr-1" />
                          {t('logs.stopDebug', 'Stop Debug')}
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => launchDebugSession(selectedHook)}
                        >
                          <Bug className="h-4 w-4 mr-1" />
                          {t('logs.launchDebug', 'Launch Debug')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Debug Session Status */}
                  {debugSessionMessage && (
                    <div className={cn(
                      "rounded-lg p-3 border",
                      debugSessionRunning
                        ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                        : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                    )}>
                      <div className="flex items-center gap-2">
                        {debugSessionRunning && (
                          <RefreshCw className="h-4 w-4 text-green-600 animate-spin" />
                        )}
                        <p className={cn(
                          "text-sm",
                          debugSessionRunning ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-300"
                        )}>
                          {debugSessionMessage}
                        </p>
                      </div>
                      {debugSessionRunning && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {t('logs.debugSessionRunning', 'Debug session is running. Logs will auto-refresh. Click "Stop Debug" to end early.')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Info about real logs */}
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {t('logs.debugLogsHint', 'Showing real Claude Code execution logs from ~/.claude/debug/. Click "Launch Debug" to start Claude Code in debug mode and capture hook execution logs.')}
                    </p>
                  </div>

                  {/* Execution Logs List - filtered by selected hook type */}
                  {logsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin" />
                      <p>{t('logs.loading')}</p>
                    </div>
                  ) : (() => {
                    // Filter logs by selected hook type
                    const filteredLogs = selectedHook
                      ? executionLogs.filter(log => log.hookType === selectedHook.type)
                      : executionLogs

                    return filteredLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>{selectedHook ? t('logs.noLogsForHook', { type: selectedHook.type }) : t('logs.noLogs')}</p>
                      <p className="text-sm mt-2">{t('logs.noLogsHint')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-auto">
                      {filteredLogs.map((log) => (
                        <div key={log.id}>
                          <Card
                            className={cn(
                              "cursor-pointer transition-all hover:border-primary",
                              selectedLog?.id === log.id && "border-primary bg-accent"
                            )}
                            onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {log.status === 'success' && (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  )}
                                  {log.status === 'failed' && (
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  )}
                                  {log.status === 'timeout' && (
                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                  )}
                                  {log.status === 'blocked' && (
                                    <AlertCircle className="h-4 w-4 text-orange-500" />
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    {log.hookType}
                                  </Badge>
                                  <span className="text-sm font-medium">{log.trigger}</span>
                                  <Badge
                                    variant={log.status === 'success' ? 'default' : 'destructive'}
                                    className="text-xs"
                                  >
                                    {t(`logs.status.${log.status}`)}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {log.duration > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Timer className="h-3 w-3" />
                                      {log.duration}ms
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                                {log.command || log.output || log.hookName}
                              </div>
                            </CardContent>
                          </Card>

                          {/* Expanded Log Details - shown below the selected log */}
                          {selectedLog?.id === log.id && (
                            <div className="mt-1 ml-4 border-l-2 border-primary pl-4 pb-2">
                              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-2 font-medium text-sm">
                                    <FileCode className="h-4 w-4" />
                                    {t('logs.details')}
                                  </span>
                                  <Badge
                                    variant={log.status === 'success' ? 'default' : 'destructive'}
                                  >
                                    {log.exitCode !== undefined ? `Exit: ${log.exitCode}` : log.status}
                                  </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-xs text-muted-foreground">{t('logs.hookType', 'Hook Type')}:</span>
                                    <p className="font-medium">{log.hookType}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-muted-foreground">{t('logs.hookName', 'Hook Name')}:</span>
                                    <p className="font-medium">{log.hookName}</p>
                                  </div>
                                </div>

                                {log.command && (
                                  <div>
                                    <span className="text-xs text-muted-foreground">{t('logs.command')}:</span>
                                    <p className="text-sm font-mono bg-background p-2 rounded mt-1 break-all">{log.command}</p>
                                  </div>
                                )}

                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  {log.duration > 0 && (
                                    <div>
                                      <span className="text-xs text-muted-foreground">{t('logs.duration')}:</span>
                                      <p className="font-medium">{log.duration}ms</p>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-xs text-muted-foreground">{t('logs.timestamp')}:</span>
                                    <p className="font-medium">{new Date(log.timestamp).toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-muted-foreground">{t('logs.location')}:</span>
                                    <p className="font-medium">{log.location}</p>
                                  </div>
                                </div>

                                {log.output && (
                                  <div>
                                    <span className="text-xs text-muted-foreground">{t('logs.output')}:</span>
                                    <pre className="text-xs font-mono bg-green-50 dark:bg-green-950 p-3 rounded mt-1 overflow-auto max-h-[150px] whitespace-pre-wrap">
                                      {log.output}
                                    </pre>
                                  </div>
                                )}

                                {log.error && (
                                  <div>
                                    <span className="text-xs text-muted-foreground">{t('logs.error')}:</span>
                                    <pre className="text-xs font-mono bg-red-50 dark:bg-red-950 p-3 rounded mt-1 overflow-auto max-h-[150px] whitespace-pre-wrap text-red-600 dark:text-red-400">
                                      {log.error}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        ))}
                    </div>
                  )
                  })()}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center">
              <Webhook className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('selectHook')}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={isEditing || isCreating} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? t('dialog.createTitle') : `${t('dialog.editTitle')}: ${editForm.name}`}
            </DialogTitle>
            <DialogDescription>
              {isCreating ? t('dialog.createDescription') : t('dialog.editDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/50 text-destructive rounded-md p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {t('validation.title')}
                </h4>
                <p className="text-sm mb-2">{t('validation.fixErrors')}</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Hook Type */}
            <div className="space-y-2">
              <Label>{t('dialog.type')}</Label>
              <Select
                value={editForm.type}
                onValueChange={(value: HookType) => setEditForm({ ...editForm, type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('dialog.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_TYPE_GROUPS.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{t(`groups.${g.group}`, g.group)}</SelectLabel>
                      {g.types.map((type) => (
                        <SelectItem key={type} value={type}>
                          <div className="flex flex-col">
                            <span>{t(`events.${type}.title`, type)}</span>
                            <span className="text-xs text-muted-foreground">{t(`events.${type}.description`, '')}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label>{t('dialog.location')}</Label>
              <Select
                value={editForm.location}
                onValueChange={(value: 'user' | 'project') =>
                  setEditForm({ ...editForm, location: value, projectPath: value === 'user' ? '' : editForm.projectPath })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {t('dialog.locationUser')}
                    </div>
                  </SelectItem>
                  <SelectItem value="project">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      {t('dialog.locationProject')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Project Path (only for project hooks) */}
            {editForm.location === 'project' && (
              <div className="space-y-2">
                <Label>{t('dialog.projectPath')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={editForm.projectPath}
                    placeholder={t('dialog.projectPathPlaceholder')}
                    readOnly
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={handleSelectProjectPath}>
                    <FolderOpen className="h-4 w-4 mr-1" />
                    {t('dialog.browse')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('dialog.projectPathHint')}: {editForm.projectPath ? `${editForm.projectPath}/.claude/settings.json` : t('dialog.projectPathRequired')}
                </p>
              </div>
            )}

            {/* Matcher Pattern */}
            <div className="space-y-2">
              <Label>{t('dialog.matcher', 'Matcher')}</Label>
              <Input
                value={editForm.matcher}
                onChange={(e) => setEditForm({ ...editForm, matcher: e.target.value })}
                placeholder={t('dialog.matcherPlaceholder', 'Tool name pattern (e.g., Bash, Edit|Write)')}
              />
              <p className="text-xs text-muted-foreground">
                {t('dialog.matcherHint', 'Leave empty to match all. Use | for multiple patterns (e.g., Edit|Write)')}
              </p>
            </div>

            {/* Type-specific panels */}
            <HookTypePanels
              type={editForm.type}
              fields={{
                reloadSkills: editForm.reloadSkills,
                sessionTitle: editForm.sessionTitle,
                maxBlocks: editForm.maxBlocks,
                replaceToolOutput: editForm.replaceToolOutput,
              }}
              effort={editForm.effort}
              onChange={(partial: Partial<HookTypeFields>) => setEditForm({ ...editForm, ...partial })}
              t={t}
            />

            {/* Hook Actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('dialog.hookCommands', 'Commands')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditForm({ ...editForm, actions: [...editForm.actions, makeEmptyAction()] })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('dialog.addCommand', 'Add Command')}
                </Button>
              </div>

              {editForm.actions.map((action, index) => (
                <HookActionForm
                  key={index}
                  action={action}
                  index={index}
                  canRemove={editForm.actions.length > 1}
                  onChange={(next: HookActionItem) => {
                    const actions = [...editForm.actions]
                    actions[index] = next
                    setEditForm({ ...editForm, actions })
                  }}
                  onRemove={() => setEditForm({ ...editForm, actions: editForm.actions.filter((_, i) => i !== index) })}
                  t={t}
                />
              ))}
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>{t('dialog.preview', 'Configuration Preview')}</Label>
              <div className="bg-muted rounded-lg p-4">
                <pre className="text-xs font-mono overflow-auto max-h-[200px]">
                  {JSON.stringify({ hooks: { [editForm.type]: [buildHookConfig(editForm.actions)] } }, null, 2)}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dialog.previewHint', 'This configuration will be saved to settings.json')}
              </p>
              {editForm.actions.some((a) => a.type === 'command' && a.useScriptFile && a.scriptPath) && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {t('dialog.scriptWillBeCreated', 'Script file(s) will be created automatically')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {saveSuccess && (
              <div className="flex flex-col gap-1 mr-auto text-left">
                <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  {t('saveSuccess')}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t('saveSuccessRestartHint')}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-1" />
                {t('dialog.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? t('dialog.saving') : t('dialog.save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('deleteDialog.description')} ({selectedHook?.name})
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('deleteDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('deleteDialog.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
