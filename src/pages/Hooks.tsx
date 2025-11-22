import React, { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Webhook, Globe, FolderOpen, Terminal, Code, Zap, ArrowRight, PlayCircle, Clock, FileCode, HelpCircle, BookOpen } from 'lucide-react'

interface Hook {
  name: string
  event: string
  description?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  filePath?: string
  location?: 'user' | 'project'
}

// Hook event type descriptions
const EVENT_INFO: Record<string, {
  title: string
  description: string
  icon: React.ComponentType<any>
  color: string
  examples: string[]
}> = {
  'session-start': {
    title: 'Session Start',
    description: 'Triggered when Claude Code starts a new session',
    icon: PlayCircle,
    color: 'text-green-500',
    examples: [
      'Initialize services or background processes',
      'Check for updates or sync data',
      'Set up environment variables',
      'Load user preferences'
    ]
  },
  'tool-call': {
    title: 'Tool Call',
    description: 'Triggered when Claude calls a tool',
    icon: Zap,
    color: 'text-yellow-500',
    examples: [
      'Log tool usage for analytics',
      'Validate tool parameters',
      'Add custom preprocessing',
      'Implement rate limiting'
    ]
  },
  'prompt-submit': {
    title: 'Prompt Submit',
    description: 'Triggered when user submits a prompt',
    icon: Terminal,
    color: 'text-blue-500',
    examples: [
      'Preprocess user input',
      'Add context or metadata',
      'Implement custom filters',
      'Track conversation patterns'
    ]
  },
  'session-end': {
    title: 'Session End',
    description: 'Triggered when Claude Code session ends',
    icon: Clock,
    color: 'text-red-500',
    examples: [
      'Clean up temporary files',
      'Save session state',
      'Stop background services',
      'Generate session reports'
    ]
  }
}

export default function Hooks() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [selectedHook, setSelectedHook] = useState<Hook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHooks()
  }, [])

  const loadHooks = async () => {
    try {
      console.log('[Hooks Page] Loading hooks...')
      setLoading(true)
      const data = await api.hooks.getAll()
      console.log('[Hooks Page] Loaded', data.length, 'hooks:', data)
      setHooks(data)
      if (data.length > 0 && !selectedHook) {
        setSelectedHook(data[0])
      }
    } catch (error) {
      console.error('[Hooks Page] Failed to load hooks:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Loading hooks...</div>
          <div className="text-muted-foreground">Please wait</div>
        </div>
      </div>
    )
  }

  const userHooks = hooks.filter(h => h.location === 'user')
  const projectHooks = hooks.filter(h => h.location === 'project')

  return (
    <div className="flex h-full gap-4">
      {/* Left Sidebar - Hooks List */}
      <div className="w-80 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold">Hooks</h1>
          <p className="text-muted-foreground mt-2">
            {hooks.length} hook{hooks.length !== 1 ? 's' : ''} configured
          </p>
        </div>

        {/* Hooks List */}
        <div className="flex-1 overflow-auto space-y-3">
          {hooks.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hooks configured</p>
                <p className="text-sm mt-2">Add hooks to automate tasks</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* User Hooks */}
              {userHooks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground px-1">
                    User Hooks ({userHooks.length})
                  </h3>
                  {userHooks.map((hook) => (
                    <Card
                      key={hook.filePath}
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedHook?.filePath === hook.filePath ? 'border-primary bg-accent' : ''
                      }`}
                      onClick={() => setSelectedHook(hook)}
                    >
                      <CardHeader className="p-4">
                        <div className="flex items-start gap-3">
                          <Webhook className="h-4 w-4 shrink-0 mt-1" />
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">{hook.name}</CardTitle>
                            {hook.description && (
                              <CardDescription className="text-sm mt-1 line-clamp-2">
                                {hook.description}
                              </CardDescription>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Badge variant="default" className="text-xs">
                                <Globe className="h-3 w-3 mr-1" />
                                User
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {hook.event}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}

              {/* Project Hooks */}
              {projectHooks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground px-1">
                    Project Hooks ({projectHooks.length})
                  </h3>
                  {projectHooks.map((hook) => (
                    <Card
                      key={hook.filePath}
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedHook?.filePath === hook.filePath ? 'border-primary bg-accent' : ''
                      }`}
                      onClick={() => setSelectedHook(hook)}
                    >
                      <CardHeader className="p-4">
                        <div className="flex items-start gap-3">
                          <Webhook className="h-4 w-4 shrink-0 mt-1" />
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">{hook.name}</CardTitle>
                            {hook.description && (
                              <CardDescription className="text-sm mt-1 line-clamp-2">
                                {hook.description}
                              </CardDescription>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Badge variant="secondary" className="text-xs">
                                <FolderOpen className="h-3 w-3 mr-1" />
                                Project
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {hook.event}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Info Box */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">About Hooks</h4>
            <p className="text-xs text-muted-foreground">
              Hooks allow you to automate tasks at specific events like session start, tool execution, or prompt submission.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Hook Details */}
      <div className="flex-1 overflow-auto">
        {selectedHook ? (
          <div className="space-y-4">
            {/* Header Card */}
            <Card>
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
                </div>
                <div className="flex gap-2 mt-4">
                  <Badge variant={selectedHook.location === 'user' ? 'default' : 'secondary'}>
                    {selectedHook.location === 'user' ? <Globe className="h-3 w-3 mr-1" /> : <FolderOpen className="h-3 w-3 mr-1" />}
                    {selectedHook.location === 'user' ? 'User' : 'Project'}
                  </Badge>
                  <Badge variant="outline">{selectedHook.event}</Badge>
                </div>
              </CardHeader>
            </Card>

            {/* Event Flow Visualization */}
            {EVENT_INFO[selectedHook.event] && (
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Hook Execution Flow
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4 p-4 bg-muted rounded-lg">
                    <div className="flex-1 text-center">
                      <div className="flex justify-center mb-2">
                        {React.createElement(EVENT_INFO[selectedHook.event].icon, {
                          className: `h-8 w-8 ${EVENT_INFO[selectedHook.event].color}`
                        })}
                      </div>
                      <p className="font-semibold text-sm">{EVENT_INFO[selectedHook.event].title}</p>
                      <p className="text-xs text-muted-foreground mt-1">Event Triggered</p>
                    </div>

                    <ArrowRight className="h-6 w-6 text-muted-foreground" />

                    <div className="flex-1 text-center">
                      <div className="flex justify-center mb-2">
                        <Webhook className="h-8 w-8 text-purple-500" />
                      </div>
                      <p className="font-semibold text-sm">Hook Executes</p>
                      <p className="text-xs text-muted-foreground mt-1">{selectedHook.name}</p>
                    </div>

                    <ArrowRight className="h-6 w-6 text-muted-foreground" />

                    <div className="flex-1 text-center">
                      <div className="flex justify-center mb-2">
                        <Terminal className="h-8 w-8 text-blue-500" />
                      </div>
                      <p className="font-semibold text-sm">Command Runs</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedHook.command || 'Script'}
                      </p>
                    </div>
                  </div>

                  {/* Event Description */}
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm font-medium mb-2">📘 About this Event</p>
                    <p className="text-sm text-muted-foreground">
                      {EVENT_INFO[selectedHook.event].description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs for Details */}
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="usage">Use Cases</TabsTrigger>
                    <TabsTrigger value="config">Configuration</TabsTrigger>
                  </TabsList>

                  {/* Details Tab */}
                  <TabsContent value="details" className="space-y-4 mt-4">
                    {/* Command Info */}
                    {selectedHook.command && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Code className="h-4 w-4" />
                          Command
                        </h3>
                        <div className="bg-muted rounded-lg p-4">
                          <p className="text-sm font-mono">{selectedHook.command}</p>
                          {selectedHook.args && selectedHook.args.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs text-muted-foreground mb-2">Arguments:</p>
                              <div className="space-y-1">
                                {selectedHook.args.map((arg, i) => (
                                  <p key={i} className="text-sm font-mono text-muted-foreground">
                                    {i + 1}. {arg}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Environment Variables */}
                    {selectedHook.env && Object.keys(selectedHook.env).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Environment Variables</h3>
                        <div className="bg-muted rounded-lg p-4 space-y-2">
                          {Object.entries(selectedHook.env).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-2">
                              <span className="text-sm font-mono font-semibold">{key}:</span>
                              <span className="text-sm font-mono text-muted-foreground flex-1 break-all">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* File Path */}
                    {selectedHook.filePath && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <FileCode className="h-4 w-4" />
                          Configuration File
                        </h3>
                        <div className="bg-muted rounded-lg p-4">
                          <p className="text-sm font-mono break-all">{selectedHook.filePath}</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* Use Cases Tab */}
                  <TabsContent value="usage" className="space-y-4 mt-4">
                    {EVENT_INFO[selectedHook.event] ? (
                      <>
                        <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <BookOpen className="h-4 w-4" />
                            Common Use Cases for {EVENT_INFO[selectedHook.event].title}
                          </h3>
                          <ul className="space-y-2">
                            {EVENT_INFO[selectedHook.event].examples.map((example, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <span className="text-purple-500 mt-1">▸</span>
                                <span>{example}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Real-world Example */}
                        <div className="p-4 bg-muted rounded-lg">
                          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Zap className="h-4 w-4" />
                            This Hook's Purpose
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {selectedHook.description || `This ${selectedHook.event} hook executes custom logic when the event is triggered.`}
                          </p>
                          {selectedHook.name === 'reminder-session-start' && (
                            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded border-l-4 border-blue-500">
                              <p className="text-sm font-medium mb-1">💡 Example:</p>
                              <p className="text-sm text-muted-foreground">
                                This hook initializes the reminder service when Claude Code starts, checking if dependencies are installed and starting the background MCP server for managing reminders.
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No use case information available for this event type</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Configuration Tab */}
                  <TabsContent value="config" className="space-y-4 mt-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <h3 className="text-sm font-semibold mb-3">Hook Configuration Structure</h3>
                      <pre className="text-xs font-mono bg-background p-3 rounded overflow-auto">
{`{
  "name": "${selectedHook.name}",
  "event": "${selectedHook.event}",${selectedHook.description ? `
  "description": "${selectedHook.description}",` : ''}${selectedHook.command ? `
  "command": "${selectedHook.command}",` : ''}${selectedHook.args && selectedHook.args.length > 0 ? `
  "args": ${JSON.stringify(selectedHook.args, null, 2).split('\n').join('\n  ')},` : ''}${selectedHook.env && Object.keys(selectedHook.env).length > 0 ? `
  "env": ${JSON.stringify(selectedHook.env, null, 2).split('\n').join('\n  ')}` : ''}
}`}
                      </pre>
                    </div>

                    <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        How to Create Your Own Hook
                      </h3>
                      <ol className="text-sm space-y-2 mt-3">
                        <li className="flex gap-2">
                          <span className="font-semibold">1.</span>
                          <span>Create a JSON file in <code className="bg-background px-1 rounded">~/.claude/hooks/</code></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold">2.</span>
                          <span>Choose an event type: <code className="bg-background px-1 rounded">session-start</code>, <code className="bg-background px-1 rounded">tool-call</code>, <code className="bg-background px-1 rounded">prompt-submit</code>, or <code className="bg-background px-1 rounded">session-end</code></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold">3.</span>
                          <span>Specify the command to run and any arguments needed</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold">4.</span>
                          <span>Restart Claude Code to activate the hook</span>
                        </li>
                      </ol>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center">
              <Webhook className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a hook to view details</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
