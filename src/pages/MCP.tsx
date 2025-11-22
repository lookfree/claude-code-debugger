import { useEffect, useState } from 'react'
import type { MCPServers } from '../../shared/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function MCP() {
  const [servers, setServers] = useState<MCPServers>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    try {
      console.log('[MCP Page] Loading MCP servers...')
      const data = await window.electronAPI.getMCPServers()
      console.log('[MCP Page] Loaded servers:', data)
      setServers(data)
    } catch (error) {
      console.error('[MCP Page] Error loading servers:', error)
    } finally {
      setLoading(false)
    }
  }

  const serverEntries = Object.entries(servers)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">MCP Servers</h1>
        <p className="text-muted-foreground mt-2">Manage Model Context Protocol servers</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading MCP servers...
        </div>
      ) : serverEntries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No MCP servers configured yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {serverEntries.map(([name, config]) => (
            <Card key={name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{name}</CardTitle>
                  {config.disabled && (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </div>
                {config.description && (
                  <CardDescription>{config.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Command:</span>{' '}
                    <code className="bg-muted px-1 py-0.5 rounded">{config.command}</code>
                  </div>
                  {config.args && config.args.length > 0 && (
                    <div>
                      <span className="font-medium">Arguments:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {config.args.map((arg, idx) => (
                          <code key={idx} className="bg-muted px-1 py-0.5 rounded text-xs">
                            {arg}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                  {config.env && Object.keys(config.env).length > 0 && (
                    <div>
                      <span className="font-medium">Environment Variables:</span>
                      <div className="mt-1 space-y-1">
                        {Object.entries(config.env).map(([key, value]) => (
                          <div key={key} className="text-xs">
                            <code className="bg-muted px-1 py-0.5 rounded">{key}={value}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {config.timeout && (
                    <div>
                      <span className="font-medium">Timeout:</span> {config.timeout}ms
                    </div>
                  )}
                  {config.alwaysAllow && config.alwaysAllow.length > 0 && (
                    <div>
                      <span className="font-medium">Always Allow:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {config.alwaysAllow.map((tool, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
