import React, { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Zap,
  Webhook,
  Server,
  Terminal,
  BookOpen,
  Sparkles,
  GitBranch,
  Layers,
  ArrowRight,
  User,
  Clock,
  MessageSquare,
  CheckCircle2,
  Activity,
  Info
} from 'lucide-react'

interface Skill {
  name: string
  description?: string
  location?: 'user' | 'plugin'
}

interface Hook {
  name: string
  event: string
  description?: string
  location?: 'user' | 'project'
}

interface MCPServer {
  name: string
  description?: string
  location?: 'user' | 'project'
}

interface SlashCommand {
  name: string
  description?: string
  location?: 'user' | 'project'
}

interface GraphStats {
  skills: number
  hooks: number
  mcpServers: number
  commands: number
  relationships: number
}

export default function Graph() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [hooks, setHooks] = useState<Hook[]>([])
  const [mcpServers, setMCPServers] = useState<Record<string, MCPServer>>({})
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<GraphStats>({
    skills: 0,
    hooks: 0,
    mcpServers: 0,
    commands: 0,
    relationships: 0,
  })
  const [edges, setEdges] = useState<Array<{ id: string; source: string; target: string; label: string }>>([])
  const [nodes, setNodes] = useState<Array<{ id: string; data: { type: string; label: string } }>>([])
  const [connectedNodesCount, setConnectedNodesCount] = useState(0)

  // Load all data
  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    try {
      setLoading(true)
      const [skillsData, hooksData, mcpData, commandsData] = await Promise.all([
        api.skills.getAll(),
        api.hooks.getAll(),
        api.mcp.getAll(),
        api.commands.getAll(),
      ])

      setSkills(skillsData)
      setHooks(hooksData)
      setMCPServers(mcpData)
      setCommands(commandsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Build edges for relationship detection
  useEffect(() => {
    if (loading) return

    const newEdges: Array<{ id: string; source: string; target: string; label: string }> = []
    const newNodes: Array<{ id: string; data: { type: string; label: string } }> = []

    // Helper to create node ID
    const createNodeId = (type: string, name: string) => `${type}-${name}`

    // Add all nodes for reference
    skills.forEach(skill => {
      newNodes.push({ id: createNodeId('skill', skill.name), data: { type: 'skill', label: skill.name } })
    })
    hooks.forEach(hook => {
      newNodes.push({ id: createNodeId('hook', hook.name), data: { type: 'hook', label: hook.name } })
    })
    Object.keys(mcpServers).forEach(mcpName => {
      newNodes.push({ id: createNodeId('mcp', mcpName), data: { type: 'mcp', label: mcpName } })
    })
    commands.forEach(command => {
      newNodes.push({ id: createNodeId('command', command.name), data: { type: 'command', label: command.name } })
    })

    // Helper function to extract key words from names
    const extractKeywords = (name: string): string[] => {
      // Remove common suffixes and split by delimiters
      const cleaned = name
        .toLowerCase()
        .replace(/-service$/g, '')
        .replace(/-server$/g, '')
        .replace(/-skill$/g, '')
        .replace(/-session-start$/g, '')
        .replace(/-session-end$/g, '')
        .replace(/-hook$/g, '')
        .replace(/-command$/g, '')
        .replace(/^user-/g, '')
        .replace(/^project-/g, '')

      // Split by common delimiters
      return cleaned.split(/[-_\s]+/).filter(word => word.length > 2)
    }

    // Helper function to check if two names are related
    const areRelated = (name1: string, name2: string): boolean => {
      const keywords1 = extractKeywords(name1)
      const keywords2 = extractKeywords(name2)

      // Check if they share at least one meaningful keyword
      return keywords1.some(k1 => keywords2.some(k2 => k1 === k2 || k1.includes(k2) || k2.includes(k1)))
    }

    // Build relationships based on naming patterns

    // 1. Connect Skills to MCP Servers (by keyword matching)
    skills.forEach(skill => {
      const skillId = createNodeId('skill', skill.name)
      Object.keys(mcpServers).forEach(mcpName => {
        const mcpId = createNodeId('mcp', mcpName)
        if (areRelated(skill.name, mcpName)) {
          newEdges.push({ id: `${skillId}-${mcpId}`, source: skillId, target: mcpId, label: 'uses' })
        }
      })
    })

    // 2. Connect Hooks to MCP Servers (by keyword matching)
    hooks.forEach(hook => {
      const hookId = createNodeId('hook', hook.name)
      Object.keys(mcpServers).forEach(mcpName => {
        const mcpId = createNodeId('mcp', mcpName)
        if (areRelated(hook.name, mcpName)) {
          newEdges.push({ id: `${hookId}-${mcpId}`, source: hookId, target: mcpId, label: 'initializes' })
        }
      })
    })

    // 3. Connect Skills to Hooks (by keyword matching)
    skills.forEach(skill => {
      const skillId = createNodeId('skill', skill.name)
      hooks.forEach(hook => {
        const hookId = createNodeId('hook', hook.name)
        if (areRelated(skill.name, hook.name)) {
          newEdges.push({ id: `${skillId}-${hookId}`, source: skillId, target: hookId, label: 'configures' })
        }
      })
    })

    // 4. Connect Commands to Skills (by keyword matching)
    commands.forEach(command => {
      const commandId = createNodeId('command', command.name)
      skills.forEach(skill => {
        const skillId = createNodeId('skill', skill.name)
        if (areRelated(command.name, skill.name)) {
          newEdges.push({ id: `${commandId}-${skillId}`, source: commandId, target: skillId, label: 'invokes' })
        }
      })
    })

    // 5. Connect Commands to MCP Servers (by keyword matching)
    commands.forEach(command => {
      const commandId = createNodeId('command', command.name)
      Object.keys(mcpServers).forEach(mcpName => {
        const mcpId = createNodeId('mcp', mcpName)
        if (areRelated(command.name, mcpName)) {
          newEdges.push({ id: `${commandId}-${mcpId}`, source: commandId, target: mcpId, label: 'triggers' })
        }
      })
    })

    setNodes(newNodes)
    setEdges(newEdges)

    // Update stats
    setStats({
      skills: skills.length,
      hooks: hooks.length,
      mcpServers: Object.keys(mcpServers).length,
      commands: commands.length,
      relationships: newEdges.length,
    })
  }, [skills, hooks, mcpServers, commands, loading])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 animate-pulse text-primary" />
          <div className="text-lg font-semibold mb-2">Building Dependency Graph...</div>
          <div className="text-muted-foreground">Analyzing relationships</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <GitBranch className="h-8 w-8" />
          Dependency Graph
        </h1>
        <p className="text-muted-foreground mt-2">
          Visualize how Skills, Hooks, MCP Servers, and Commands work together
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-500">{stats.skills}</div>
                <div className="text-xs text-muted-foreground">Skills</div>
              </div>
              <BookOpen className="h-8 w-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-purple-500">{stats.hooks}</div>
                <div className="text-xs text-muted-foreground">Hooks</div>
              </div>
              <Webhook className="h-8 w-8 text-purple-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-500">{stats.mcpServers}</div>
                <div className="text-xs text-muted-foreground">MCP Servers</div>
              </div>
              <Server className="h-8 w-8 text-green-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-500">{stats.commands}</div>
                <div className="text-xs text-muted-foreground">Commands</div>
              </div>
              <Terminal className="h-8 w-8 text-orange-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-primary">{stats.relationships}</div>
                <div className="text-xs text-muted-foreground">Relationships</div>
              </div>
              <GitBranch className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Data Flow Details Panel - Generic System */}
      {edges.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              数据流向与触发机制
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Render detected relationship chains */}
              {(() => {
                // Build relationship chains from edges
                const chains = new Map<string, { hook?: Hook; mcp?: string; skill?: Skill; command?: SlashCommand }[]>()

                // Group nodes by shared keywords
                edges.forEach(edge => {
                  const sourceNode = nodes.find(n => n.id === edge.source)
                  const targetNode = nodes.find(n => n.id === edge.target)

                  if (!sourceNode || !targetNode || !sourceNode.data || !targetNode.data || !sourceNode.data.label || !targetNode.data.label) return

                  // Extract base keyword for grouping
                  const extractBaseKeyword = (name: string): string => {
                    return name
                      .toLowerCase()
                      .replace(/-service$/g, '')
                      .replace(/-server$/g, '')
                      .replace(/-skill$/g, '')
                      .replace(/-session-start$/g, '')
                      .replace(/-hook$/g, '')
                      .replace(/-command$/g, '')
                      .split(/[-_\s]+/)[0]
                  }

                  const sourceKeyword = extractBaseKeyword(sourceNode.data.label)
                  const targetKeyword = extractBaseKeyword(targetNode.data.label)
                  const chainKey = sourceKeyword === targetKeyword ? sourceKeyword : `${sourceKeyword}-${targetKeyword}`

                  if (!chains.has(chainKey)) {
                    chains.set(chainKey, [])
                  }

                  const chain = chains.get(chainKey)!

                  // Add nodes to chain
                  if (sourceNode.data.type === 'hook') {
                    const hook = hooks.find(h => h.name === sourceNode.data.label)
                    if (hook && !chain.some(c => c.hook?.name === hook.name)) {
                      chain.push({ hook })
                    }
                  } else if (sourceNode.data.type === 'skill') {
                    const skill = skills.find(s => s.name === sourceNode.data.label)
                    if (skill && !chain.some(c => c.skill?.name === skill.name)) {
                      chain.push({ skill })
                    }
                  } else if (sourceNode.data.type === 'mcp') {
                    if (!chain.some(c => c.mcp === sourceNode.data.label)) {
                      chain.push({ mcp: sourceNode.data.label })
                    }
                  } else if (sourceNode.data.type === 'command') {
                    const command = commands.find(cmd => cmd.name === sourceNode.data.label)
                    if (command && !chain.some(c => c.command?.name === command.name)) {
                      chain.push({ command })
                    }
                  }

                  if (targetNode.data.type === 'hook') {
                    const hook = hooks.find(h => h.name === targetNode.data.label)
                    if (hook && !chain.some(c => c.hook?.name === hook.name)) {
                      chain.push({ hook })
                    }
                  } else if (targetNode.data.type === 'skill') {
                    const skill = skills.find(s => s.name === targetNode.data.label)
                    if (skill && !chain.some(c => c.skill?.name === skill.name)) {
                      chain.push({ skill })
                    }
                  } else if (targetNode.data.type === 'mcp') {
                    if (!chain.some(c => c.mcp === targetNode.data.label)) {
                      chain.push({ mcp: targetNode.data.label })
                    }
                  } else if (targetNode.data.type === 'command') {
                    const command = commands.find(cmd => cmd.name === targetNode.data.label)
                    if (command && !chain.some(c => c.command?.name === command.name)) {
                      chain.push({ command })
                    }
                  }
                })

                // Render each detected chain
                return Array.from(chains.entries()).map(([chainKey, chain], chainIndex) => {
                  if (chain.length === 0) return null

                  const hasHook = chain.some(c => c.hook)
                  const hasMCP = chain.some(c => c.mcp)
                  const hasSkill = chain.some(c => c.skill)
                  const hasCommand = chain.some(c => c.command)

                  // Only show chains with at least 2 components
                  if ([hasHook, hasMCP, hasSkill, hasCommand].filter(Boolean).length < 2) return null

                  return (
                    <div
                      key={chainIndex}
                      className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg border-2 border-blue-200 dark:border-blue-800"
                    >
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-500" />
                        {chainKey.charAt(0).toUpperCase() + chainKey.slice(1)} 系统工作流程
                      </h3>

                      <div className="space-y-3">
                        {/* Step 1: Session start (if hook exists) */}
                        {hasHook && chain.find(c => c.hook) && (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white font-bold shrink-0">
                                1
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <User className="h-4 w-4 text-blue-500" />
                                  <span className="font-semibold">用户启动 Claude Code</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  触发事件：{chain.find(c => c.hook)?.hook?.event || 'session-start'}
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-center">
                              <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            </div>

                            {/* Step 2: Hook executes */}
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500 text-white font-bold shrink-0">
                                2
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Webhook className="h-4 w-4 text-purple-500" />
                                  <span className="font-semibold">{chain.find(c => c.hook)?.hook?.name} Hook 执行</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {chain.find(c => c.hook)?.hook?.description || '监听事件，自动触发初始化脚本'}
                                </p>
                              </div>
                            </div>
                            {hasMCP && (
                              <div className="flex justify-center">
                                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </>
                        )}

                        {/* Step 3: MCP Server starts (if MCP exists) */}
                        {hasMCP && (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white font-bold shrink-0">
                                {hasHook ? 3 : 1}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Server className="h-4 w-4 text-green-500" />
                                  <span className="font-semibold">{chain.find(c => c.mcp)?.mcp} MCP Server 启动</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {mcpServers[chain.find(c => c.mcp)?.mcp || '']?.description || '后台服务启动，提供工具接口'}
                                </p>
                              </div>
                            </div>
                            {hasSkill && (
                              <div className="flex justify-center">
                                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </>
                        )}

                        {/* Step 4: User input (if skill exists) */}
                        {hasSkill && (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500 text-white font-bold shrink-0">
                                {[hasHook, hasMCP].filter(Boolean).length + 1}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <MessageSquare className="h-4 w-4 text-orange-500" />
                                  <span className="font-semibold">用户输入请求</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  用户与 Claude 对话，触发 {chain.find(c => c.skill)?.skill?.name} 功能
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-center">
                              <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            </div>

                            {/* Step 5: Skill activates */}
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white font-bold shrink-0">
                                {[hasHook, hasMCP].filter(Boolean).length + 2}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <BookOpen className="h-4 w-4 text-blue-500" />
                                  <span className="font-semibold">{chain.find(c => c.skill)?.skill?.name} Skill 被激活</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {chain.find(c => c.skill)?.skill?.description || '检测到相关关键词，解析用户意图'}
                                </p>
                              </div>
                            </div>
                            {hasMCP && (
                              <>
                                <div className="flex justify-center">
                                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                </div>

                                {/* Step 6: Call MCP tool */}
                                <div className="flex items-start gap-3">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white font-bold shrink-0">
                                    {[hasHook, hasMCP].filter(Boolean).length + 3}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Zap className="h-4 w-4 text-green-500" />
                                      <span className="font-semibold">调用 MCP 工具执行操作</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      Skill 通过 {chain.find(c => c.mcp)?.mcp} 提供的工具完成任务
                                    </p>
                                  </div>
                                </div>
                              </>
                            )}
                            <div className="flex justify-center">
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            </div>
                          </>
                        )}

                        {/* Command workflow (if command exists) */}
                        {hasCommand && !hasSkill && (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500 text-white font-bold shrink-0">
                                {[hasHook, hasMCP].filter(Boolean).length + 1}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Terminal className="h-4 w-4 text-orange-500" />
                                  <span className="font-semibold">用户执行命令</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  运行斜杠命令：/{chain.find(c => c.command)?.command?.name}
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-center">
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Key insights */}
                      <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          💡 关键理解点
                        </p>
                        <ul className="mt-2 space-y-1 text-xs text-blue-800 dark:text-blue-200">
                          {hasHook && <li>• Hook 在启动时自动运行，监听 {chain.find(c => c.hook)?.hook?.event} 事件</li>}
                          {hasMCP && <li>• MCP Server 持续运行在后台，提供工具接口给其他组件调用</li>}
                          {hasSkill && <li>• Skill 根据用户输入被激活，通过 MCP 工具完成任务</li>}
                          {hasCommand && <li>• Command 提供快捷指令，可以触发预定义的操作流程</li>}
                          <li>• {[hasHook, hasMCP, hasSkill, hasCommand].filter(Boolean).length} 个组件协同工作，形成完整的功能闭环</li>
                        </ul>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            {edges.length > 0 && Array.from(new Set(edges.map(e => nodes.find(n => n.id === e.source)?.type))).length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无检测到完整的工作流程链</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              未检测到组件关系
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>当前系统中暂无检测到Skills、Hooks、MCP Servers或Commands之间的关联关系。</p>
              <div className="p-4 bg-muted rounded-lg">
                <div className="font-semibold mb-2">调试信息：</div>
                <ul className="space-y-1">
                  <li>• Skills数量: {stats.skills}</li>
                  <li>• Hooks数量: {stats.hooks}</li>
                  <li>• MCP Servers数量: {stats.mcpServers}</li>
                  <li>• Commands数量: {stats.commands}</li>
                  <li>• 检测到的关系: {edges.length}</li>
                </ul>
              </div>
              <p className="text-xs">
                提示：关系检测基于组件名称的关键词匹配。例如：reminder skill会与reminder-service MCP server建立关系。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
