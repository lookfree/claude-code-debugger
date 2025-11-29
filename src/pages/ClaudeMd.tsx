import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, Globe, FolderOpen, Save } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface ClaudeMDFile {
  content: string
  location: 'user' | 'project' | 'global'
  filePath: string
  exists: boolean
  projectName?: string
}

export default function ClaudeMd() {
  const [files, setFiles] = useState<ClaudeMDFile[]>([])
  const [selectedFile, setSelectedFile] = useState<ClaudeMDFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    console.log('[CLAUDE.md Page] Component mounted, loading files...')
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      console.log('[CLAUDE.md Page] Loading files...')
      setLoading(true)
      const data = await api.claudeMD.getAll()
      console.log('[CLAUDE.md Page] Loaded', data.length, 'files:', data)
      setFiles(data)
      // Auto-select global file by default
      const globalFile = data.find(f => f.location === 'global')
      if (globalFile) {
        setSelectedFile(globalFile)
      }
    } catch (error) {
      console.error('[CLAUDE.md Page] Failed to load files:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    if (selectedFile) {
      setEditContent(selectedFile.content)
      setEditMode(true)
    }
  }

  const handleSave = async () => {
    if (!selectedFile) return
    try {
      await api.claudeMD.save(editContent, selectedFile.location as 'user' | 'project')
      setEditMode(false)
      await loadFiles()
    } catch (error) {
      console.error('[CLAUDE.md Page] Failed to save:', error)
    }
  }

  const handleCancel = () => {
    setEditMode(false)
    setEditContent('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Loading CLAUDE.md files...</div>
          <div className="text-muted-foreground">Please wait</div>
        </div>
      </div>
    )
  }

  const globalFile = files.find(f => f.location === 'global')
  const projectFiles = files.filter(f => f.location === 'project')

  return (
    <div className="flex h-full gap-4">
      {/* Left Sidebar - File List */}
      <div className="w-80 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold">CLAUDE.md</h1>
          <p className="text-muted-foreground mt-2">
            Found {files.filter(f => f.exists).length} CLAUDE.md files in {projectFiles.length} projects
          </p>
        </div>

        {/* File Cards */}
        <div className="flex-1 overflow-auto space-y-3">
          {/* Global CLAUDE.md */}
          {globalFile && (
            <Card
              className={`cursor-pointer transition-all hover:border-primary ${
                selectedFile?.filePath === globalFile.filePath ? 'border-primary bg-accent' : ''
              }`}
              onClick={() => setSelectedFile(globalFile)}
            >
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4 shrink-0" />
                      <span className="truncate">Global</span>
                    </CardTitle>
                    <CardDescription className="text-sm mt-1 truncate">
                      {globalFile.filePath}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="default">
                    <Globe className="h-3 w-3 mr-1" /> Global
                  </Badge>
                  {globalFile.exists ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Exists
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-600 border-orange-600">
                      Not Created
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Project CLAUDE.md files */}
          {projectFiles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">Projects ({projectFiles.length})</h3>
              {projectFiles.map((file) => (
                <Card
                  key={file.filePath}
                  className={`cursor-pointer transition-all hover:border-primary ${
                    selectedFile?.filePath === file.filePath ? 'border-primary bg-accent' : ''
                  }`}
                  onClick={() => setSelectedFile(file)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 shrink-0" />
                          <span className="truncate">{file.projectName || 'Unknown'}</span>
                        </CardTitle>
                        <CardDescription className="text-xs mt-1 truncate" title={file.filePath}>
                          {file.filePath}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        <FolderOpen className="h-3 w-3 mr-1" /> Project
                      </Badge>
                      {file.exists ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                          Not Created
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">About CLAUDE.md</h4>
            <p className="text-xs text-muted-foreground">
              CLAUDE.md files provide context and instructions to Claude Code. Global configurations
              apply to all projects, while project-specific ones override global settings.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - File Content */}
      <div className="flex-1 overflow-auto">
        {selectedFile ? (
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <FileText className="h-6 w-6" />
                    {selectedFile.location === 'global' ? 'Global' : selectedFile.projectName || 'Project'} CLAUDE.md
                  </CardTitle>
                  <CardDescription className="mt-2">{selectedFile.filePath}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {!editMode && selectedFile.exists && (
                    <Button onClick={handleEdit} variant="outline" size="sm">
                      Edit
                    </Button>
                  )}
                  {editMode && (
                    <>
                      <Button onClick={handleSave} size="sm">
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button onClick={handleCancel} variant="outline" size="sm">
                        Cancel
                      </Button>
                    </>
                  )}
                  {!editMode && !selectedFile.exists && (
                    <Button onClick={handleEdit} size="sm">
                      Create
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Badge variant={selectedFile.location === 'global' ? 'default' : 'secondary'}>
                  {selectedFile.location === 'global' ? 'Global' : 'Project'}
                </Badge>
                {selectedFile.exists ? (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Exists
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    Not Created
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editMode ? (
                <div className="space-y-4">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-[600px] p-4 font-mono text-sm border rounded-md bg-background"
                    placeholder="Enter your CLAUDE.md content here..."
                  />
                </div>
              ) : (
                <Tabs defaultValue="preview" className="w-full">
                  <TabsList>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="raw">Raw Markdown</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="mt-4">
                    {selectedFile.content ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {selectedFile.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>This CLAUDE.md file hasn't been created yet.</p>
                        <p className="text-sm mt-2">Click the "Create" button to get started.</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="raw" className="mt-4">
                    {selectedFile.content ? (
                      <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[600px]">
                        <code className="font-mono text-sm">{selectedFile.content}</code>
                      </pre>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No content available</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a file to view details</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
