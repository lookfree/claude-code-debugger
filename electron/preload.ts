import { contextBridge, ipcRenderer } from 'electron'
import type { Skill, Agent, Hook, MCPServers, MCPServerConfig, SlashCommand, ProjectContext, ConfigFile } from '../shared/types'

console.log('[Preload] Script is loading...')

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Skills
  getSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:getAll'),
  getSkill: (name: string): Promise<Skill | null> => ipcRenderer.invoke('skills:get', name),
  saveSkill: (skill: Skill): Promise<void> => ipcRenderer.invoke('skills:save', skill),
  deleteSkill: (name: string): Promise<void> => ipcRenderer.invoke('skills:delete', name),

  // Agents
  getAgents: (): Promise<Agent[]> => ipcRenderer.invoke('agents:getAll'),
  getAgent: (name: string): Promise<Agent | null> => ipcRenderer.invoke('agents:get', name),
  saveAgent: (agent: Agent): Promise<void> => ipcRenderer.invoke('agents:save', agent),
  deleteAgent: (name: string): Promise<void> => ipcRenderer.invoke('agents:delete', name),

  // Hooks
  getHooks: (): Promise<Hook[]> => ipcRenderer.invoke('hooks:getAll'),
  getHook: (name: string): Promise<Hook | null> => ipcRenderer.invoke('hooks:get', name),
  saveHook: (hook: Hook): Promise<void> => ipcRenderer.invoke('hooks:save', hook),
  deleteHook: (name: string): Promise<void> => ipcRenderer.invoke('hooks:delete', name),

  // MCP
  getMCPServers: (): Promise<MCPServers> => ipcRenderer.invoke('mcp:getAll'),
  getMCPServer: (name: string): Promise<MCPServerConfig | null> => ipcRenderer.invoke('mcp:get', name),
  saveMCPServer: (name: string, config: MCPServerConfig): Promise<void> => ipcRenderer.invoke('mcp:save', name, config),
  deleteMCPServer: (name: string): Promise<void> => ipcRenderer.invoke('mcp:delete', name),
  testMCPConnection: (name: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('mcp:test', name),

  // Commands
  getCommands: (): Promise<SlashCommand[]> => ipcRenderer.invoke('commands:getAll'),
  getCommand: (name: string): Promise<SlashCommand | null> => ipcRenderer.invoke('commands:get', name),
  saveCommand: (command: SlashCommand): Promise<void> => ipcRenderer.invoke('commands:save', command),
  deleteCommand: (name: string): Promise<void> => ipcRenderer.invoke('commands:delete', name),

  // CLAUDE.md
  getClaudeMD: (): Promise<string> => ipcRenderer.invoke('claudemd:get'),
  getAllClaudeMD: (): Promise<Array<{ content: string; location: 'user' | 'project' | 'global'; filePath: string; exists: boolean }>> => ipcRenderer.invoke('claudemd:getAll'),
  saveClaudeMD: (content: string, location: 'user' | 'project'): Promise<void> => ipcRenderer.invoke('claudemd:save', content, location),

  // Project
  getProjectContext: (): Promise<ProjectContext> => ipcRenderer.invoke('project:getContext'),
  selectProjectPath: (): Promise<string | null> => ipcRenderer.invoke('project:selectPath'),

  // File watching
  onFilesChanged: (callback: (files: ConfigFile[]) => void) => {
    ipcRenderer.on('files:changed', (_event, files) => callback(files))
  },

  // Dependencies
  getDependencyGraph: (): Promise<{ nodes: unknown[]; edges: unknown[] }> => ipcRenderer.invoke('dependencies:getGraph'),

  // Validation
  validateConfig: (type: string, config: unknown): Promise<{ valid: boolean; errors?: string[] }> => ipcRenderer.invoke('validate:config', type, config),
})

console.log('[Preload] electronAPI exposed to window')

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: {
      // Skills
      getSkills: () => Promise<Skill[]>
      getSkill: (name: string) => Promise<Skill | null>
      saveSkill: (skill: Skill) => Promise<void>
      deleteSkill: (name: string) => Promise<void>

      // Agents
      getAgents: () => Promise<Agent[]>
      getAgent: (name: string) => Promise<Agent | null>
      saveAgent: (agent: Agent) => Promise<void>
      deleteAgent: (name: string) => Promise<void>

      // Hooks
      getHooks: () => Promise<Hook[]>
      getHook: (name: string) => Promise<Hook | null>
      saveHook: (hook: Hook) => Promise<void>
      deleteHook: (name: string) => Promise<void>

      // MCP
      getMCPServers: () => Promise<MCPServers>
      getMCPServer: (name: string) => Promise<MCPServerConfig | null>
      saveMCPServer: (name: string, config: MCPServerConfig) => Promise<void>
      deleteMCPServer: (name: string) => Promise<void>
      testMCPConnection: (name: string) => Promise<{ success: boolean; message?: string }>

      // Commands
      getCommands: () => Promise<SlashCommand[]>
      getCommand: (name: string) => Promise<SlashCommand | null>
      saveCommand: (command: SlashCommand) => Promise<void>
      deleteCommand: (name: string) => Promise<void>

      // CLAUDE.md
      getClaudeMD: () => Promise<string>
      getAllClaudeMD: () => Promise<Array<{ content: string; location: 'user' | 'project' | 'global'; filePath: string; exists: boolean }>>
      saveClaudeMD: (content: string, location: 'user' | 'project') => Promise<void>

      // Project
      getProjectContext: () => Promise<ProjectContext>
      selectProjectPath: () => Promise<string | null>

      // File watching
      onFilesChanged: (callback: (files: ConfigFile[]) => void) => void

      // Dependencies
      getDependencyGraph: () => Promise<{ nodes: unknown[]; edges: unknown[] }>

      // Validation
      validateConfig: (type: string, config: unknown) => Promise<{ valid: boolean; errors?: string[] }>
    }
  }
}
