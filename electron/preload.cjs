const { contextBridge, ipcRenderer } = require('electron')

console.log('[Preload] Script is loading...')

contextBridge.exposeInMainWorld('electronAPI', {
  // Skills
  getSkills: () => ipcRenderer.invoke('skills:getAll'),
  getSkill: (name) => ipcRenderer.invoke('skills:get', name),
  saveSkill: (skill) => ipcRenderer.invoke('skills:save', skill),
  deleteSkill: (name) => ipcRenderer.invoke('skills:delete', name),

  // Agents
  getAgents: () => ipcRenderer.invoke('agents:getAll'),
  getAgent: (name) => ipcRenderer.invoke('agents:get', name),
  saveAgent: (agent) => ipcRenderer.invoke('agents:save', agent),
  deleteAgent: (name) => ipcRenderer.invoke('agents:delete', name),

  // Hooks
  getHooks: () => ipcRenderer.invoke('hooks:getAll'),
  getHook: (name) => ipcRenderer.invoke('hooks:get', name),
  saveHook: (hook) => ipcRenderer.invoke('hooks:save', hook),
  deleteHook: (name) => ipcRenderer.invoke('hooks:delete', name),

  // MCP
  getMCPServers: () => ipcRenderer.invoke('mcp:getAll'),
  getMCPServer: (name) => ipcRenderer.invoke('mcp:get', name),
  saveMCPServer: (name, config) => ipcRenderer.invoke('mcp:save', name, config),
  deleteMCPServer: (name) => ipcRenderer.invoke('mcp:delete', name),
  testMCPConnection: (name) => ipcRenderer.invoke('mcp:test', name),

  // Commands
  getCommands: () => ipcRenderer.invoke('commands:getAll'),
  getCommand: (name) => ipcRenderer.invoke('commands:get', name),
  saveCommand: (command) => ipcRenderer.invoke('commands:save', command),
  deleteCommand: (name) => ipcRenderer.invoke('commands:delete', name),

  // CLAUDE.md
  getClaudeMD: () => ipcRenderer.invoke('claudemd:get'),
  getAllClaudeMD: () => ipcRenderer.invoke('claudemd:getAll'),
  saveClaudeMD: (content, location) => ipcRenderer.invoke('claudemd:save', content, location),

  // Project
  getProjectContext: () => ipcRenderer.invoke('project:getContext'),
  selectProjectPath: () => ipcRenderer.invoke('project:selectPath'),

  // File watching
  onFilesChanged: (callback) => {
    ipcRenderer.on('files:changed', (_event, files) => callback(files))
  },

  // Dependencies
  getDependencyGraph: () => ipcRenderer.invoke('dependencies:getGraph'),

  // Validation
  validateConfig: (type, config) => ipcRenderer.invoke('validate:config', type, config)
})

console.log('[Preload] electronAPI exposed to window')
