import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { SlashCommand } from '@shared/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Terminal, Globe, FolderOpen, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

export default function Commands() {
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [selectedCommand, setSelectedCommand] = useState<SlashCommand | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCommands()
  }, [])

  const loadCommands = async () => {
    try {
      console.log('[Commands Page] Loading commands...')
      setLoading(true)
      const data = await api.commands.getAll()
      console.log('[Commands Page] Loaded', data.length, 'commands:', data)
      setCommands(data)
      if (data.length > 0 && !selectedCommand) {
        setSelectedCommand(data[0])
      }
    } catch (error) {
      console.error('[Commands Page] Failed to load commands:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCommands = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const userCommands = filteredCommands.filter((cmd) => cmd.location === 'user')
  const projectCommands = filteredCommands.filter((cmd) => cmd.location === 'project')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Loading commands...</div>
          <div className="text-muted-foreground">Please wait</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left Sidebar - Commands List */}
      <div className="w-80 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold">Slash Commands</h1>
          <p className="text-muted-foreground mt-2">Manage your custom slash commands</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4" />
                User
              </CardTitle>
              <div className="text-2xl font-bold">{userCommands.length}</div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Project
              </CardTitle>
              <div className="text-2xl font-bold">{projectCommands.length}</div>
            </CardHeader>
          </Card>
        </div>

        {/* Commands List */}
        <div className="flex-1 overflow-auto space-y-2">
          {filteredCommands.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                {searchQuery ? 'No commands found matching your search.' : 'No commands available.'}
              </CardContent>
            </Card>
          ) : (
            filteredCommands.map((cmd) => (
              <Card
                key={cmd.name}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary',
                  selectedCommand?.name === cmd.name && 'border-primary bg-accent'
                )}
                onClick={() => setSelectedCommand(cmd)}
              >
                <CardHeader className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Terminal className="h-4 w-4 shrink-0" />
                        <span className="truncate">/{cmd.name}</span>
                      </CardTitle>
                      <CardDescription className="text-sm mt-1 line-clamp-2">
                        {cmd.description}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Badge variant={cmd.location === 'user' ? 'default' : 'secondary'}>
                      {cmd.location === 'user' ? (
                        <><Globe className="h-3 w-3 mr-1" /> User</>
                      ) : (
                        <><FolderOpen className="h-3 w-3 mr-1" /> Project</>
                      )}
                    </Badge>
                    {cmd.enabled && <Badge variant="outline">Enabled</Badge>}
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Command Details */}
      <div className="flex-1 overflow-auto">
        {selectedCommand ? (
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Terminal className="h-6 w-6" />
                    /{selectedCommand.name}
                  </CardTitle>
                  <CardDescription className="mt-2">{selectedCommand.description}</CardDescription>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Badge variant={selectedCommand.location === 'user' ? 'default' : 'secondary'}>
                  {selectedCommand.location === 'user' ? 'User' : 'Project'}
                </Badge>
                <Badge variant="outline">{selectedCommand.type}</Badge>
                {selectedCommand.enabled && <Badge variant="outline">Enabled</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="useguide">Usage Guide</TabsTrigger>
                  <TabsTrigger value="instructions">Instructions</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div>
                    <h3 className="font-semibold mb-2">Usage</h3>
                    <code className="block bg-muted p-3 rounded-md font-mono text-sm">
                      {selectedCommand.usage}
                    </code>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Description</h3>
                    <p className="text-muted-foreground">{selectedCommand.description}</p>
                  </div>

                  {selectedCommand.filePath && (
                    <div>
                      <h3 className="font-semibold mb-2">File Path</h3>
                      <code className="block bg-muted p-3 rounded-md font-mono text-sm break-all">
                        {selectedCommand.filePath}
                      </code>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="useguide" className="space-y-4 mt-4">
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <h3>How to Use This Command</h3>

                    <div className="bg-muted p-4 rounded-md">
                      <h4 className="text-sm font-semibold mb-2">Basic Usage</h4>
                      <p className="text-sm mb-2">In Claude Code, enter the following command to execute:</p>
                      <code className="block bg-background p-3 rounded-md font-mono text-sm">
                        {selectedCommand.usage}
                      </code>
                    </div>

                    <div className="bg-muted p-4 rounded-md mt-4">
                      <h4 className="text-sm font-semibold mb-2">Command Description</h4>
                      <p className="text-sm">{selectedCommand.description}</p>
                    </div>

                    {selectedCommand.location && (
                      <div className="bg-muted p-4 rounded-md mt-4">
                        <h4 className="text-sm font-semibold mb-2">Scope</h4>
                        <p className="text-sm">
                          {selectedCommand.location === 'user' ? (
                            <>
                              <Badge variant="default" className="mr-2">User Level</Badge>
                              This command is globally available in all projects
                            </>
                          ) : (
                            <>
                              <Badge variant="secondary" className="mr-2">Project Level</Badge>
                              This command is only available in the current project
                            </>
                          )}
                        </p>
                      </div>
                    )}

                    <div className="bg-muted p-4 rounded-md mt-4">
                      <h4 className="text-sm font-semibold mb-2">Usage Steps</h4>
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Enter <code>{selectedCommand.usage}</code> in Claude Code's chat interface</li>
                        <li>The command will automatically expand and execute its defined instructions</li>
                        <li>Claude will complete the corresponding tasks according to the command's instructions</li>
                        <li>Review the execution results and perform follow-up operations as needed</li>
                      </ol>
                    </div>

                    {selectedCommand.filePath && (
                      <div className="bg-muted p-4 rounded-md mt-4">
                        <h4 className="text-sm font-semibold mb-2">Edit Command</h4>
                        <p className="text-sm mb-2">To modify this command, you can directly edit the following file:</p>
                        <code className="block bg-background p-3 rounded-md font-mono text-xs break-all">
                          {selectedCommand.filePath}
                        </code>
                      </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 rounded-md mt-4">
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        💡 Tips
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>Commands start with a slash <code>/</code></li>
                        <li>Command names typically use lowercase letters and hyphens</li>
                        <li>You can configure <code>allowed-tools</code> in the command file's frontmatter to restrict which tools Claude can use</li>
                        <li>Command instructions support Markdown format and dynamic execution syntax <code>!`command`</code></li>
                      </ul>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="instructions" className="mt-4">
                  {selectedCommand.instructions ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                      >
                        {selectedCommand.instructions}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No instructions available.</p>
                  )}
                </TabsContent>

                <TabsContent value="details" className="space-y-4 mt-4">
                  <div>
                    <h3 className="font-semibold mb-2">Command Type</h3>
                    <Badge>{selectedCommand.type}</Badge>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Pattern</h3>
                    <code className="block bg-muted p-3 rounded-md font-mono text-sm">
                      {selectedCommand.pattern}
                    </code>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Scope</h3>
                    <Badge variant="outline">{selectedCommand.scope}</Badge>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Handler</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium">Type:</span>
                        <Badge className="ml-2" variant="secondary">{selectedCommand.handler.type}</Badge>
                      </div>
                      {selectedCommand.handler.code && (
                        <div>
                          <span className="text-sm font-medium mb-2 block">Code:</span>
                          <pre className="bg-muted p-3 rounded-md overflow-auto max-h-96">
                            <code className="font-mono text-sm">{selectedCommand.handler.code}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedCommand.aliases && selectedCommand.aliases.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Aliases</h3>
                      <div className="flex gap-2 flex-wrap">
                        {selectedCommand.aliases.map((alias) => (
                          <Badge key={alias} variant="outline">{alias}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a command to view details</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
