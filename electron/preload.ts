import { contextBridge, ipcRenderer } from 'electron'

console.log('[Preload] Script is loading...')

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Skills
  getSkills: () => ipcRenderer.invoke('skills:getAll'),
  getSkill: (name: string) => ipcRenderer.invoke('skills:get', name),
  saveSkill: (skill: unknown) => ipcRenderer.invoke('skills:save', skill),
  deleteSkill: (name: string) => ipcRenderer.invoke('skills:delete', name),

  // Agents
  getAgents: () => ipcRenderer.invoke('agents:getAll'),
  getAgent: (name: string) => ipcRenderer.invoke('agents:get', name),
  saveAgent: (agent: unknown) => ipcRenderer.invoke('agents:save', agent),
  deleteAgent: (name: string) => ipcRenderer.invoke('agents:delete', name),

  // Hooks
  getHooks: () => ipcRenderer.invoke('hooks:getAll'),
  getHook: (name: string) => ipcRenderer.invoke('hooks:get', name),
  saveHook: (hook: unknown) => ipcRenderer.invoke('hooks:save', hook),
  deleteHook: (name: string) => ipcRenderer.invoke('hooks:delete', name),

  // MCP
  getMCPServers: () => ipcRenderer.invoke('mcp:getAll'),
  getMCPServer: (name: string) => ipcRenderer.invoke('mcp:get', name),
  saveMCPServer: (name: string, config: unknown) => ipcRenderer.invoke('mcp:save', name, config),
  deleteMCPServer: (name: string) => ipcRenderer.invoke('mcp:delete', name),
  testMCPConnection: (name: string) => ipcRenderer.invoke('mcp:test', name),

  // Commands
  getCommands: () => ipcRenderer.invoke('commands:getAll'),
  getCommand: (name: string) => ipcRenderer.invoke('commands:get', name),
  saveCommand: (command: unknown) => ipcRenderer.invoke('commands:save', command),
  deleteCommand: (name: string) => ipcRenderer.invoke('commands:delete', name),

  // CLAUDE.md
  getClaudeMD: () => ipcRenderer.invoke('claudemd:get'),
  getAllClaudeMD: () => ipcRenderer.invoke('claudemd:getAll'),
  saveClaudeMD: (content: string, location: 'user' | 'project') => ipcRenderer.invoke('claudemd:save', content, location),

  // Project
  getProjectContext: () => ipcRenderer.invoke('project:getContext'),
  selectProjectPath: () => ipcRenderer.invoke('project:selectPath'),

  // File watching
  onFilesChanged: (callback: (files: unknown) => void) => {
    ipcRenderer.on('files:changed', (_event, files) => callback(files))
  },

  // Dependencies
  getDependencyGraph: () => ipcRenderer.invoke('dependencies:getGraph'),

  // Validation
  validateConfig: (type: string, config: unknown) => ipcRenderer.invoke('validate:config', type, config),
})

console.log('[Preload] electronAPI exposed to window')

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: {
      // Skills
      getSkills: () => Promise<unknown[]>
      getSkill: (name: string) => Promise<unknown>
      saveSkill: (skill: unknown) => Promise<void>
      deleteSkill: (name: string) => Promise<void>

      // Agents
      getAgents: () => Promise<unknown[]>
      getAgent: (name: string) => Promise<unknown>
      saveAgent: (agent: unknown) => Promise<void>
      deleteAgent: (name: string) => Promise<void>

      // Hooks
      getHooks: () => Promise<unknown[]>
      getHook: (name: string) => Promise<unknown>
      saveHook: (hook: unknown) => Promise<void>
      deleteHook: (name: string) => Promise<void>

      // MCP
      getMCPServers: () => Promise<unknown[]>
      getMCPServer: (name: string) => Promise<unknown>
      saveMCPServer: (name: string, config: unknown) => Promise<void>
      deleteMCPServer: (name: string) => Promise<void>
      testMCPConnection: (name: string) => Promise<unknown>

      // Commands
      getCommands: () => Promise<unknown[]>
      getCommand: (name: string) => Promise<unknown>
      saveCommand: (command: unknown) => Promise<void>
      deleteCommand: (name: string) => Promise<void>

      // CLAUDE.md
      getClaudeMD: () => Promise<unknown>
      getAllClaudeMD: () => Promise<Array<{ content: string; location: 'user' | 'project' | 'global'; filePath: string; exists: boolean }>>
      saveClaudeMD: (content: string, location: 'user' | 'project') => Promise<void>

      // Project
      getProjectContext: () => Promise<unknown>
      selectProjectPath: () => Promise<string | null>

      // File watching
      onFilesChanged: (callback: (files: unknown) => void) => void

      // Dependencies
      getDependencyGraph: () => Promise<unknown>

      // Validation
      validateConfig: (type: string, config: unknown) => Promise<{ valid: boolean; errors?: string[] }>
    }
  }
}
