import fs from 'fs/promises'
import path from 'path'
import { watch, FSWatcher } from 'chokidar'
import os from 'os'
import type { Skill, Agent, Hook, MCPServers, SlashCommand, ProjectContext, ConfigFile } from '../../shared/types'

export class FileManager {
  private static instance: FileManager
  private projectPath: string = process.cwd()
  private userConfigPath: string = path.join(os.homedir(), '.claude')
  private watcher: FSWatcher | null = null
  private changeCallbacks: Array<(files: ConfigFile[]) => void> = []

  private constructor() {}

  static getInstance(): FileManager {
    if (!FileManager.instance) {
      FileManager.instance = new FileManager()
    }
    return FileManager.instance
  }

  initialize() {
    this.setupFileWatcher()
  }

  cleanup() {
    if (this.watcher) {
      this.watcher.close()
    }
  }

  setProjectPath(newPath: string) {
    this.projectPath = newPath
    this.setupFileWatcher()
  }

  private setupFileWatcher() {
    if (this.watcher) {
      this.watcher.close()
    }

    const watchPaths = [
      path.join(this.projectPath, '.claude'),
      path.join(this.userConfigPath),
    ]

    this.watcher = watch(watchPaths, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    })

    this.watcher.on('change', async (filePath) => {
      console.log(`File changed: ${filePath}`)
      const context = await this.getProjectContext()
      this.notifyFileChanges(context)
    })

    this.watcher.on('add', async (filePath) => {
      console.log(`File added: ${filePath}`)
      const context = await this.getProjectContext()
      this.notifyFileChanges(context)
    })

    this.watcher.on('unlink', async (filePath) => {
      console.log(`File removed: ${filePath}`)
      const context = await this.getProjectContext()
      this.notifyFileChanges(context)
    })
  }

  private notifyFileChanges(context: ProjectContext) {
    const allFiles = [
      ...context.skills,
      ...context.agents,
      ...context.hooks,
      ...context.mcpServers,
      ...context.commands,
    ]
    this.changeCallbacks.forEach((callback) => callback(allFiles))
  }

  onFilesChanged(callback: (files: ConfigFile[]) => void) {
    this.changeCallbacks.push(callback)
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async readJSONFile<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch (error) {
      console.error(`Error reading JSON file ${filePath}:`, error)
      return null
    }
  }

  private async writeJSONFile(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  private async scanDirectory(dirPath: string, extension: string): Promise<string[]> {
    try {
      const exists = await this.fileExists(dirPath)
      if (!exists) return []

      const files = await fs.readdir(dirPath)
      return files
        .filter((file) => file.endsWith(extension))
        .map((file) => path.join(dirPath, file))
    } catch {
      return []
    }
  }

  // Skills
  async getSkills(): Promise<Skill[]> {
    const skills: Skill[] = []
    console.log('[FileManager] getSkills() called')

    // Scan plugin skills (SKILL.md files)
    const pluginSkillsPath = path.join(this.userConfigPath, 'plugins', 'marketplaces', 'anthropic-agent-skills')
    console.log('[FileManager] Scanning plugin skills at:', pluginSkillsPath)
    try {
      const pluginDirs = await fs.readdir(pluginSkillsPath)
      console.log('[FileManager] Found', pluginDirs.length, 'directories')
      for (const dir of pluginDirs) {
        const skillPath = path.join(pluginSkillsPath, dir)
        const stat = await fs.stat(skillPath).catch(() => null)
        if (stat?.isDirectory()) {
          const skillMdPath = path.join(skillPath, 'SKILL.md')
          if (await this.fileExists(skillMdPath)) {
            console.log('[FileManager] Parsing skill:', dir)
            const skill = await this.parseSkillMD(skillMdPath, 'user')
            if (skill) {
              console.log('[FileManager] Successfully parsed:', skill.name)
              skills.push(skill)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning plugin skills:', error)
    }

    // Scan user skills (both JSON and SKILL.md)
    const userSkillsPath = path.join(this.userConfigPath, 'skills')
    try {
      const exists = await this.fileExists(userSkillsPath)
      if (exists) {
        const userDirs = await fs.readdir(userSkillsPath)
        for (const dir of userDirs) {
          const skillPath = path.join(userSkillsPath, dir)
          const stat = await fs.stat(skillPath).catch(() => null)
          if (stat?.isDirectory()) {
            const skillMdPath = path.join(skillPath, 'SKILL.md')
            if (await this.fileExists(skillMdPath)) {
              const skill = await this.parseSkillMD(skillMdPath, 'user')
              if (skill) skills.push(skill)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning user skills:', error)
    }

    // Also scan for JSON format skills in project
    const projectSkills = await this.scanDirectory(
      path.join(this.projectPath, '.claude', 'skills'),
      '.json'
    )
    for (const skillPath of projectSkills) {
      const skill = await this.readJSONFile<Skill>(skillPath)
      if (skill) {
        skills.push({ ...skill, filePath: skillPath, location: 'project' })
      }
    }

    return skills
  }

  private async parseSkillMD(filePath: string, location: 'user' | 'project'): Promise<Skill | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')

      // Parse YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
      if (!frontmatterMatch) {
        console.error(`No frontmatter found in ${filePath}`)
        return null
      }

      const frontmatter = frontmatterMatch[1]
      const lines = frontmatter.split('\n')
      const metadata: Record<string, string> = {}

      for (const line of lines) {
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim()
          const value = line.slice(colonIndex + 1).trim()
          metadata[key] = value
        }
      }

      const name = metadata.name || path.basename(path.dirname(filePath))
      const description = metadata.description || ''

      // Extract instructions (everything after frontmatter)
      const instructions = content.slice(frontmatterMatch[0].length).trim()

      // Get skill directory
      const skillDir = path.dirname(filePath)

      // Scan for references directory
      const references: Array<{ type: string; path: string; description?: string }> = []
      const referencesDir = path.join(skillDir, 'references')
      if (await this.fileExists(referencesDir)) {
        try {
          const refFiles = await fs.readdir(referencesDir)
          for (const file of refFiles) {
            const ext = path.extname(file)
            references.push({
              type: ext.slice(1) || 'file',
              path: `references/${file}`,
            })
          }
        } catch (error) {
          // Ignore errors reading references
        }
      }

      // Scan for scripts directory
      const scripts: Array<{ name: string; command: string; description?: string; content?: string }> = []
      const scriptsDir = path.join(skillDir, 'scripts')
      if (await this.fileExists(scriptsDir)) {
        try {
          const scriptFiles = await fs.readdir(scriptsDir)
          for (const file of scriptFiles) {
            const ext = path.extname(file)
            if (ext === '.py' || ext === '.sh' || ext === '.js' || ext === '.ts') {
              const scriptPath = path.join(scriptsDir, file)
              let content: string | undefined
              let description: string | undefined

              try {
                // Read script content
                const scriptContent = await fs.readFile(scriptPath, 'utf-8')
                content = scriptContent

                // Extract description from first comment block
                if (ext === '.py') {
                  // Match Python docstrings
                  const docMatch = scriptContent.match(/(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/)
                  if (docMatch) {
                    description = (docMatch[1] || docMatch[2]).trim().split('\n')[0]
                  }
                } else if (ext === '.sh') {
                  // Match shell script comments
                  const lines = scriptContent.split('\n')
                  for (const line of lines) {
                    if (line.startsWith('#') && !line.startsWith('#!')) {
                      description = line.slice(1).trim()
                      break
                    }
                  }
                }

                // Count lines
                const lineCount = scriptContent.split('\n').length
                description = description || `${lineCount} lines`
              } catch (err) {
                // Ignore errors reading individual files
              }

              const commandPrefix = ext === '.py' ? 'python' : ext === '.sh' ? 'bash' : 'node'
              scripts.push({
                name: file,
                command: `${commandPrefix} scripts/${file}`,
                description,
                content,
              })
            }
          }
        } catch (error) {
          // Ignore errors reading scripts
        }
      }

      // Extract triggers from content with more detail
      const triggers: {
        commands?: string[]
        contexts?: string[]
        keywords?: {
          actions?: Array<{ word: string; type: string }>
          formats?: Array<{ word: string; type: string }>
          topics?: Array<{ word: string; type: string }>
          technologies?: Array<{ word: string; type: string }>
        }
        examples?: string[]
      } = {}

      // Extract action keywords
      const actionWords = new Set<string>()
      const actionMatches = instructions.match(/\b(create|generate|convert|export|update|delete|add|remove|edit|modify|analyze|process|extract|validate|build|make|design|develop|implement|test|deploy|fix)\b/gi)
      if (actionMatches) {
        actionMatches.forEach(w => actionWords.add(w.toLowerCase()))
      }

      // Extract format keywords
      const formatWords = new Set<string>()
      const formatMatches = instructions.match(/\b(json|yaml|xml|csv|markdown|html|pdf|png|svg|jpg|jpeg|gif|webp|mp4|avi|zip|tar|gz)\b/gi)
      if (formatMatches) {
        formatMatches.forEach(w => formatWords.add(w.toLowerCase()))
      }

      // Extract topic keywords
      const topicWords = new Set<string>()
      const topicMatches = instructions.match(/\b(diagram|chart|graph|visualization|report|documentation|test|analysis|workflow|pipeline|architecture|design|model)\b/gi)
      if (topicMatches) {
        topicMatches.forEach(w => topicWords.add(w.toLowerCase()))
      }

      // Extract technology keywords
      const techWords = new Set<string>()
      const techMatches = instructions.match(/\b(plantuml|uml|python|javascript|typescript|react|node|docker|kubernetes|aws|gcp|azure|git|github)\b/gi)
      if (techMatches) {
        techMatches.forEach(w => techWords.add(w.toLowerCase()))
      }

      // Extract example queries from markdown code blocks or quoted text
      const examples: string[] = []
      const exampleMatches = instructions.match(/(?:"([^"]+)"|`([^`]+)`|Example:\s*(.+?)(?:\n|$))/gi)
      if (exampleMatches) {
        exampleMatches.slice(0, 5).forEach(match => {
          const cleaned = match.replace(/^["'`]|["'`]$/g, '').replace(/^Example:\s*/i, '').trim()
          if (cleaned.length > 10 && cleaned.length < 100) {
            examples.push(cleaned)
          }
        })
      }

      if (actionWords.size > 0 || formatWords.size > 0 || topicWords.size > 0 || techWords.size > 0) {
        triggers.keywords = {
          actions: actionWords.size > 0 ? Array.from(actionWords).map(w => ({ word: w, type: 'action' })) : undefined,
          formats: formatWords.size > 0 ? Array.from(formatWords).map(w => ({ word: w, type: 'format' })) : undefined,
          topics: topicWords.size > 0 ? Array.from(topicWords).map(w => ({ word: w, type: 'topic' })) : undefined,
          technologies: techWords.size > 0 ? Array.from(techWords).map(w => ({ word: w, type: 'technology' })) : undefined,
        }

        console.log(`[FileManager] Extracted triggers for ${name}:`, {
          actions: actionWords.size,
          formats: formatWords.size,
          topics: topicWords.size,
          technologies: techWords.size,
          examples: examples.length
        })
      }

      if (examples.length > 0) {
        triggers.examples = examples
      }

      // Also keep simple commands list for backward compatibility
      if (actionWords.size > 0) {
        triggers.commands = Array.from(actionWords)
      }

      const skill: Skill = {
        name,
        type: 'skill',
        description,
        enabled: true,
        implementation: {
          type: 'inline',
          instructions,
        },
        filePath,
        location,
        references: references.length > 0 ? references : undefined,
        scripts: scripts.length > 0 ? scripts : undefined,
        triggers: Object.keys(triggers).length > 0 ? triggers : undefined,
        content, // Add full markdown content for frontend analysis
      }

      return skill
    } catch (error) {
      console.error(`Error parsing SKILL.md at ${filePath}:`, error)
      return null
    }
  }

  async getSkill(name: string): Promise<Skill | null> {
    const skills = await this.getSkills()
    return skills.find((s) => s.name === name) || null
  }

  async saveSkill(skill: Skill): Promise<void> {
    const location = skill.location || 'project'
    const dir = location === 'project'
      ? path.join(this.projectPath, '.claude', 'skills')
      : path.join(this.userConfigPath, 'skills')

    const filePath = path.join(dir, `${skill.name}.json`)
    await this.writeJSONFile(filePath, skill)
  }

  async deleteSkill(name: string): Promise<void> {
    const skill = await this.getSkill(name)
    if (skill?.filePath) {
      await fs.unlink(skill.filePath)
    }
  }

  // Agents
  async getAgents(): Promise<Agent[]> {
    const projectAgents = await this.scanDirectory(
      path.join(this.projectPath, '.claude', 'agents'),
      '.json'
    )
    const userAgents = await this.scanDirectory(
      path.join(this.userConfigPath, 'agents'),
      '.json'
    )

    const allAgentPaths = [
      ...projectAgents.map((p) => ({ path: p, location: 'project' as const })),
      ...userAgents.map((p) => ({ path: p, location: 'user' as const })),
    ]

    const agents: Agent[] = []
    for (const { path: agentPath, location } of allAgentPaths) {
      const agent = await this.readJSONFile<Agent>(agentPath)
      if (agent) {
        agents.push({ ...agent, filePath: agentPath, location })
      }
    }

    return agents
  }

  async getAgent(name: string): Promise<Agent | null> {
    const agents = await this.getAgents()
    return agents.find((a) => a.name === name) || null
  }

  async saveAgent(agent: Agent): Promise<void> {
    const location = agent.location || 'project'
    const dir = location === 'project'
      ? path.join(this.projectPath, '.claude', 'agents')
      : path.join(this.userConfigPath, 'agents')

    const filePath = path.join(dir, `${agent.name}.json`)
    await this.writeJSONFile(filePath, agent)
  }

  async deleteAgent(name: string): Promise<void> {
    const agent = await this.getAgent(name)
    if (agent?.filePath) {
      await fs.unlink(agent.filePath)
    }
  }

  // Hooks
  async getHooks(): Promise<Hook[]> {
    const projectHooks = await this.scanDirectory(
      path.join(this.projectPath, '.claude', 'hooks'),
      '.json'
    )
    const userHooks = await this.scanDirectory(
      path.join(this.userConfigPath, 'hooks'),
      '.json'
    )

    const allHookPaths = [
      ...projectHooks.map((p) => ({ path: p, location: 'project' as const })),
      ...userHooks.map((p) => ({ path: p, location: 'user' as const })),
    ]

    const hooks: Hook[] = []
    for (const { path: hookPath, location } of allHookPaths) {
      const hook = await this.readJSONFile<Hook>(hookPath)
      if (hook) {
        hooks.push({ ...hook, filePath: hookPath, location })
      }
    }

    return hooks
  }

  async getHook(name: string): Promise<Hook | null> {
    const hooks = await this.getHooks()
    return hooks.find((h) => h.name === name) || null
  }

  async saveHook(hook: Hook): Promise<void> {
    const location = hook.location || 'project'
    const dir = location === 'project'
      ? path.join(this.projectPath, '.claude', 'hooks')
      : path.join(this.userConfigPath, 'hooks')

    const filePath = path.join(dir, `${hook.name}.json`)
    await this.writeJSONFile(filePath, hook)
  }

  async deleteHook(name: string): Promise<void> {
    const hook = await this.getHook(name)
    if (hook?.filePath) {
      await fs.unlink(hook.filePath)
    }
  }

  // MCP Servers
  async getMCPServers(): Promise<MCPServers> {
    console.log('[FileManager] getMCPServers() called')

    // Try claude_mcp_config.json first (the actual file Claude uses)
    const userMCPPath = path.join(this.userConfigPath, 'claude_mcp_config.json')
    console.log('[FileManager] Checking user MCP config at:', userMCPPath)
    const userMCP = await this.readJSONFile<{ mcpServers: MCPServers }>(userMCPPath)

    // Also check for mcpServers.json in project
    const projectMCPPath = path.join(this.projectPath, '.claude', 'mcpServers.json')
    console.log('[FileManager] Checking project MCP config at:', projectMCPPath)
    const projectMCP = await this.readJSONFile<{ mcpServers: MCPServers }>(projectMCPPath)

    const servers = {
      ...(userMCP?.mcpServers || {}),
      ...(projectMCP?.mcpServers || {}),
    }

    console.log('[FileManager] Found', Object.keys(servers).length, 'MCP servers')
    return servers
  }

  async saveMCPServers(servers: MCPServers, location: 'user' | 'project' = 'project'): Promise<void> {
    const filePath = location === 'project'
      ? path.join(this.projectPath, '.claude', 'mcpServers.json')
      : path.join(this.userConfigPath, 'mcpServers.json')

    await this.writeJSONFile(filePath, { mcpServers: servers })
  }

  // Commands
  async getCommands(): Promise<SlashCommand[]> {
    console.log('[FileManager] getCommands() called')

    const commands: SlashCommand[] = []

    // Scan project commands
    const projectCommandsPath = path.join(this.projectPath, '.claude', 'commands')
    console.log('[FileManager] Scanning project commands at:', projectCommandsPath)
    try {
      const projectDirs = await fs.readdir(projectCommandsPath)
      for (const dir of projectDirs) {
        const cmdDir = path.join(projectCommandsPath, dir)
        const stat = await fs.stat(cmdDir).catch(() => null)
        if (stat?.isDirectory()) {
          const mdPath = path.join(cmdDir, `${dir}.md`)
          try {
            const content = await fs.readFile(mdPath, 'utf-8')
            const command = this.parseCommandMarkdown(mdPath, content, 'project')
            if (command) {
              console.log('[FileManager] Parsed project command:', command.name)
              commands.push(command)
            }
          } catch (error) {
            console.error(`[FileManager] Error reading command file ${mdPath}:`, error)
          }
        }
      }
    } catch (error) {
      console.log('[FileManager] No project commands found:', error)
    }

    // Scan user commands
    const userCommandsPath = path.join(this.userConfigPath, 'commands')
    console.log('[FileManager] Scanning user commands at:', userCommandsPath)
    try {
      const userDirs = await fs.readdir(userCommandsPath)
      for (const dir of userDirs) {
        const cmdDir = path.join(userCommandsPath, dir)
        const stat = await fs.stat(cmdDir).catch(() => null)
        if (stat?.isDirectory()) {
          const mdPath = path.join(cmdDir, `${dir}.md`)
          try {
            const content = await fs.readFile(mdPath, 'utf-8')
            const command = this.parseCommandMarkdown(mdPath, content, 'user')
            if (command) {
              console.log('[FileManager] Parsed user command:', command.name)
              commands.push(command)
            }
          } catch (error) {
            console.error(`[FileManager] Error reading command file ${mdPath}:`, error)
          }
        }
      }
    } catch (error) {
      console.log('[FileManager] No user commands found:', error)
    }

    console.log('[FileManager] Returning', commands.length, 'commands')
    return commands
  }

  private parseCommandMarkdown(
    filePath: string,
    content: string,
    location: 'user' | 'project'
  ): SlashCommand | null {
    try {
      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
      const frontmatter: Record<string, string> = {}

      if (frontmatterMatch) {
        const frontmatterContent = frontmatterMatch[1]
        frontmatterContent.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split(':')
          if (key && valueParts.length > 0) {
            frontmatter[key.trim()] = valueParts.join(':').trim()
          }
        })
      }

      const commandName = path.basename(path.dirname(filePath))
      const description = frontmatter.description || 'No description'

      // Extract instructions (everything after frontmatter)
      const instructionsMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/)
      const instructions = instructionsMatch ? instructionsMatch[1].trim() : content

      return {
        name: commandName,
        description,
        usage: `/${commandName}`,
        type: 'plugin',
        pattern: `^/${commandName}`,
        handler: {
          type: 'inline',
          code: instructions
        },
        instructions,
        scope: location === 'user' ? 'global' : 'project',
        enabled: true,
        filePath,
        location
      }
    } catch (error) {
      console.error('[FileManager] Error parsing command markdown:', error)
      return null
    }
  }

  async getCommand(name: string): Promise<SlashCommand | null> {
    const commands = await this.getCommands()
    return commands.find((c) => c.name === name) || null
  }

  async saveCommand(command: SlashCommand): Promise<void> {
    const location = command.location || 'project'
    const dir = location === 'project'
      ? path.join(this.projectPath, '.claude', 'commands')
      : path.join(this.userConfigPath, 'commands')

    const filePath = path.join(dir, `${command.name}.json`)
    await this.writeJSONFile(filePath, command)
  }

  async deleteCommand(name: string): Promise<void> {
    const command = await this.getCommand(name)
    if (command?.filePath) {
      await fs.unlink(command.filePath)
    }
  }

  // CLAUDE.md
  async getClaudeMDFiles(): Promise<Array<{ content: string; location: 'user' | 'project' | 'global'; filePath: string; exists: boolean; projectName?: string }>> {
    console.log('[FileManager] getClaudeMDFiles() called')
    const files = []

    // Global CLAUDE.md (in user config)
    const globalPath = path.join(this.userConfigPath, 'CLAUDE.md')
    console.log('[FileManager] Checking global CLAUDE.md at:', globalPath)
    try {
      const content = await fs.readFile(globalPath, 'utf-8')
      console.log('[FileManager] Global CLAUDE.md exists, length:', content.length)
      files.push({ content, location: 'global' as const, filePath: globalPath, exists: true })
    } catch (error) {
      console.log('[FileManager] Global CLAUDE.md does not exist')
      files.push({ content: '', location: 'global' as const, filePath: globalPath, exists: false })
    }

    // Auto-discover all project CLAUDE.md files
    const projectClaudeMdFiles = await this.discoverProjectClaudeMDs()
    console.log('[FileManager] Discovered', projectClaudeMdFiles.length, 'project CLAUDE.md files')
    files.push(...projectClaudeMdFiles)

    console.log('[FileManager] Returning', files.length, 'CLAUDE.md files')
    return files
  }

  private async discoverProjectClaudeMDs(): Promise<Array<{ content: string; location: 'project'; filePath: string; exists: boolean; projectName: string }>> {
    const discovered = []
    const homeDir = os.homedir()

    // Common development directories to scan
    const scanRoots = [
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Projects'),
      path.join(homeDir, 'Developer'),
      path.join(homeDir, 'dev'),
      path.join(homeDir, 'workspace'),
      path.join(homeDir, 'code'),
      path.join(homeDir, 'src'),
    ]

    console.log('[FileManager] Auto-discovering CLAUDE.md files in development directories...')

    for (const root of scanRoots) {
      try {
        await fs.access(root)
        const foundFiles = await this.scanForClaudeMD(root, 3) // Max depth of 3
        discovered.push(...foundFiles)
      } catch {
        // Directory doesn't exist, skip
      }
    }

    // Remove duplicates based on filePath
    const uniqueFiles = new Map<string, typeof discovered[0]>()
    for (const file of discovered) {
      if (!uniqueFiles.has(file.filePath)) {
        uniqueFiles.set(file.filePath, file)
      }
    }

    return Array.from(uniqueFiles.values())
  }

  private async scanForClaudeMD(dir: string, maxDepth: number, currentDepth = 0): Promise<Array<{ content: string; location: 'project'; filePath: string; exists: boolean; projectName: string }>> {
    const results = []

    if (currentDepth > maxDepth) {
      return results
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      // Check if CLAUDE.md exists in current directory
      const claudeMdPath = path.join(dir, 'CLAUDE.md')
      try {
        const content = await fs.readFile(claudeMdPath, 'utf-8')
        const projectName = path.basename(dir)
        console.log('[FileManager] Found CLAUDE.md in:', dir)
        results.push({
          content,
          location: 'project' as const,
          filePath: claudeMdPath,
          exists: true,
          projectName
        })
      } catch {
        // No CLAUDE.md in this directory
      }

      // Recursively scan subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryName = entry.name

          // Skip common directories that shouldn't be scanned
          if (
            entryName.startsWith('.') ||
            entryName === 'node_modules' ||
            entryName === 'vendor' ||
            entryName === 'dist' ||
            entryName === 'build' ||
            entryName === 'out' ||
            entryName === 'target' ||
            entryName === '__pycache__' ||
            entryName === 'venv' ||
            entryName === 'env'
          ) {
            continue
          }

          const subDir = path.join(dir, entryName)
          const subResults = await this.scanForClaudeMD(subDir, maxDepth, currentDepth + 1)
          results.push(...subResults)
        }
      }
    } catch (error) {
      // Permission denied or other error, skip this directory
    }

    return results
  }

  async getClaudeMD(): Promise<string> {
    const projectPath = path.join(this.projectPath, 'CLAUDE.md')
    const userPath = path.join(this.userConfigPath, 'CLAUDE.md')

    try {
      return await fs.readFile(projectPath, 'utf-8')
    } catch {
      try {
        return await fs.readFile(userPath, 'utf-8')
      } catch {
        return ''
      }
    }
  }

  async saveClaudeMD(content: string, location: 'user' | 'project' = 'project'): Promise<void> {
    const filePath = location === 'project'
      ? path.join(this.projectPath, 'CLAUDE.md')
      : path.join(this.userConfigPath, 'CLAUDE.md')

    await fs.writeFile(filePath, content, 'utf-8')
  }

  // Project Context
  async getProjectContext(): Promise<ProjectContext> {
    const getConfigFiles = async (
      dirName: string,
      type: ConfigFile['type']
    ): Promise<ConfigFile[]> => {
      const projectDir = path.join(this.projectPath, '.claude', dirName)
      const userDir = path.join(this.userConfigPath, dirName)

      const projectFiles = await this.scanDirectory(projectDir, '.json')
      const userFiles = await this.scanDirectory(userDir, '.json')

      const allFiles = [
        ...projectFiles.map((p) => ({ path: p, location: 'project' as const })),
        ...userFiles.map((p) => ({ path: p, location: 'user' as const })),
      ]

      const configFiles: ConfigFile[] = []
      for (const { path: filePath, location } of allFiles) {
        try {
          const stat = await fs.stat(filePath)
          configFiles.push({
            path: filePath,
            type,
            location,
            lastModified: stat.mtime.toISOString(),
            valid: true,
          })
        } catch {
          configFiles.push({
            path: filePath,
            type,
            location,
            lastModified: new Date().toISOString(),
            valid: false,
            errors: ['File not found or not accessible'],
          })
        }
      }

      return configFiles
    }

    return {
      projectPath: this.projectPath,
      userConfigPath: this.userConfigPath,
      skills: await getConfigFiles('skills', 'skill'),
      agents: await getConfigFiles('agents', 'agent'),
      hooks: await getConfigFiles('hooks', 'hook'),
      mcpServers: [],
      commands: await getConfigFiles('commands', 'command'),
    }
  }
}
