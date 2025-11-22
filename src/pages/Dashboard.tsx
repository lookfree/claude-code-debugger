import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { Zap, Bot, Webhook, Server, Terminal, FileText, Globe, FolderOpen } from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState({
    skills: 0,
    agents: 0,
    hooks: 0,
    mcpServers: 0,
    commands: 0,
    claudeMdFiles: 0,
    claudeMdProjects: 0,
  })
  const [claudeMdFiles, setClaudeMdFiles] = useState<Array<{
    content: string
    location: 'user' | 'project' | 'global'
    filePath: string
    exists: boolean
    projectName?: string
  }>>([])

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [skills, agents, hooks, mcpServers, commands, claudeMd] = await Promise.all([
          api.skills.getAll(),
          api.agents.getAll(),
          api.hooks.getAll(),
          api.mcp.getAll(),
          api.commands.getAll(),
          api.claudeMD.getAll(),
        ])

        setClaudeMdFiles(claudeMd)
        const existingFiles = claudeMd.filter(f => f.exists)

        setStats({
          skills: skills.length,
          agents: agents.length,
          hooks: hooks.length,
          mcpServers: Object.keys(mcpServers).length,
          commands: commands.length,
          claudeMdFiles: existingFiles.length,
          claudeMdProjects: claudeMd.filter(f => f.location === 'project' && f.exists).length,
        })
      } catch (error) {
        console.error('Failed to load stats:', error)
      }
    }

    loadStats()
  }, [])

  const cards = [
    {
      title: 'CLAUDE.md Files',
      description: 'Configuration files',
      count: stats.claudeMdFiles,
      icon: FileText,
      color: 'text-cyan-500',
    },
    {
      title: 'Skills',
      description: 'Total skills configured',
      count: stats.skills,
      icon: Zap,
      color: 'text-blue-500',
    },
    {
      title: 'Commands',
      description: 'Slash commands',
      count: stats.commands,
      icon: Terminal,
      color: 'text-pink-500',
    },
    {
      title: 'Agents',
      description: 'Active subagents',
      count: stats.agents,
      icon: Bot,
      color: 'text-purple-500',
    },
    {
      title: 'MCP Servers',
      description: 'Connected servers',
      count: stats.mcpServers,
      icon: Server,
      color: 'text-orange-500',
    },
    {
      title: 'Hooks',
      description: 'Configured hooks',
      count: stats.hooks,
      icon: Webhook,
      color: 'text-green-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of your Claude Code configuration
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.count}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CLAUDE.md Files Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CLAUDE.md Configuration Files
          </CardTitle>
          <CardDescription>
            Overview of all discovered CLAUDE.md files across your projects
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Global File */}
            {claudeMdFiles.filter(f => f.location === 'global').map((file) => (
              <div key={file.filePath} className="border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-blue-500 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">Global Configuration</h4>
                      {file.exists ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          Not Created
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate" title={file.filePath}>
                      {file.filePath}
                    </p>
                    {file.exists && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {file.content.split('\n').length} lines
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Project Files Summary */}
            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FolderOpen className="h-5 w-5 text-purple-500 mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">Project Configurations</h4>
                    <Badge variant="secondary">
                      {stats.claudeMdProjects} Projects
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Found in {stats.claudeMdProjects} different projects
                  </p>
                  {claudeMdFiles.filter(f => f.location === 'project' && f.exists).slice(0, 3).map((file) => (
                    <div key={file.filePath} className="text-xs text-muted-foreground truncate" title={file.filePath}>
                      • {file.projectName}
                    </div>
                  ))}
                  {stats.claudeMdProjects > 3 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      + {stats.claudeMdProjects - 3} more projects
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Welcome to Claude Code Debugger & Manager
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">What you can do:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Browse and manage CLAUDE.md files across all your projects</li>
              <li>Configure Skills, Agents, Hooks, MCP Servers, and Slash Commands</li>
              <li>Visualize dependencies between components</li>
              <li>Debug and test configurations in real-time</li>
              <li>Edit configurations with a visual editor</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Quick Tips:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Start with CLAUDE.md to configure project-specific instructions</li>
              <li>Use the Dependency Graph to understand component relationships</li>
              <li>Commands page shows all available slash commands</li>
              <li>Auto-discovery finds all CLAUDE.md files in ~/Documents and ~/Projects</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
