import type {
  Skill,
  Agent,
  Hook,
  MCPServers,
  MCPServerConfig,
  SlashCommand,
  ProjectContext,
} from '@shared/types'

// Type-safe wrapper around electron API
export const api = {
  // Skills
  skills: {
    getAll: async (): Promise<Skill[]> => {
      console.log('[API] window.electronAPI:', window.electronAPI)
      if (!window.electronAPI) {
        console.error('[API] window.electronAPI is undefined!')
        throw new Error('Electron API not available')
      }
      try {
        return await window.electronAPI.getSkills()
      } catch (error) {
        console.error('[API] Failed to get skills:', error)
        throw error
      }
    },
    get: async (name: string): Promise<Skill | null> => {
      if (!window.electronAPI) throw new Error('Electron API not available')
      try {
        return await window.electronAPI.getSkill(name)
      } catch (error) {
        console.error(`[API] Failed to get skill "${name}":`, error)
        throw error
      }
    },
    save: async (skill: Skill): Promise<void> => {
      if (!window.electronAPI) throw new Error('Electron API not available')
      try {
        return await window.electronAPI.saveSkill(skill)
      } catch (error) {
        console.error('[API] Failed to save skill:', error)
        throw error
      }
    },
    delete: async (name: string): Promise<void> => {
      if (!window.electronAPI) throw new Error('Electron API not available')
      try {
        return await window.electronAPI.deleteSkill(name)
      } catch (error) {
        console.error(`[API] Failed to delete skill "${name}":`, error)
        throw error
      }
    },
  },

  // Agents
  agents: {
    getAll: (): Promise<Agent[]> => window.electronAPI.getAgents(),
    get: (name: string): Promise<Agent> => window.electronAPI.getAgent(name),
    save: (agent: Agent): Promise<void> => window.electronAPI.saveAgent(agent),
    delete: (name: string): Promise<void> => window.electronAPI.deleteAgent(name),
  },

  // Hooks
  hooks: {
    getAll: (): Promise<Hook[]> => window.electronAPI.getHooks(),
    get: (name: string): Promise<Hook> => window.electronAPI.getHook(name),
    save: (hook: Hook): Promise<void> => window.electronAPI.saveHook(hook),
    delete: (name: string): Promise<void> => window.electronAPI.deleteHook(name),
  },

  // MCP
  mcp: {
    getAll: (): Promise<MCPServers> => window.electronAPI.getMCPServers(),
    get: (name: string): Promise<MCPServerConfig> => window.electronAPI.getMCPServer(name),
    save: (name: string, config: MCPServerConfig): Promise<void> =>
      window.electronAPI.saveMCPServer(name, config),
    delete: (name: string): Promise<void> => window.electronAPI.deleteMCPServer(name),
    testConnection: (name: string): Promise<unknown> => window.electronAPI.testMCPConnection(name),
  },

  // Commands
  commands: {
    getAll: (): Promise<SlashCommand[]> => window.electronAPI.getCommands(),
    get: (name: string): Promise<SlashCommand> => window.electronAPI.getCommand(name),
    save: (command: SlashCommand): Promise<void> => window.electronAPI.saveCommand(command),
    delete: (name: string): Promise<void> => window.electronAPI.deleteCommand(name),
  },

  // CLAUDE.md
  claudeMD: {
    get: (): Promise<string> => window.electronAPI.getClaudeMD(),
    getAll: (): Promise<Array<{ content: string; location: 'user' | 'project' | 'global'; filePath: string; exists: boolean }>> => window.electronAPI.getAllClaudeMD(),
    save: (content: string, location: 'user' | 'project'): Promise<void> => window.electronAPI.saveClaudeMD(content, location),
  },

  // Project
  project: {
    getContext: (): Promise<ProjectContext> => window.electronAPI.getProjectContext(),
    selectPath: (): Promise<string | null> => window.electronAPI.selectProjectPath(),
  },

  // Dependencies
  dependencies: {
    getGraph: (): Promise<{ nodes: unknown[]; edges: unknown[] }> =>
      window.electronAPI.getDependencyGraph(),
  },

  // Validation
  validate: (type: string, config: unknown): Promise<{ valid: boolean; errors?: string[] }> =>
    window.electronAPI.validateConfig(type, config),

  // File watching
  onFilesChanged: (callback: (files: unknown) => void): void => {
    window.electronAPI.onFilesChanged(callback)
  },
}
