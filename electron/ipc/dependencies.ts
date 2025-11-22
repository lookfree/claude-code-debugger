import type { IpcMain } from 'electron'
import type { FileManager } from '../services/file-manager'
import type { DependencyNode, DependencyEdge } from '../../shared/types'

export function registerDependencyHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('dependencies:getGraph', async () => {
    // TODO: Implement dependency graph generation
    const skills = await fileManager.getSkills()
    const agents = await fileManager.getAgents()
    const hooks = await fileManager.getHooks()
    const commands = await fileManager.getCommands()

    const nodes: DependencyNode[] = [
      ...skills.map((s) => ({ id: s.name, type: 'skill' as const, name: s.name, data: s })),
      ...agents.map((a) => ({ id: a.name, type: 'agent' as const, name: a.name, data: a })),
      ...hooks.map((h) => ({ id: h.name, type: 'hook' as const, name: h.name, data: h })),
      ...commands.map((c) => ({ id: c.name, type: 'command' as const, name: c.name, data: c })),
    ]

    const edges: DependencyEdge[] = []

    // Add edges based on dependencies
    skills.forEach((skill) => {
      skill.dependencies?.forEach((dep) => {
        edges.push({
          id: `${skill.name}-${dep}`,
          source: skill.name,
          target: dep,
          type: 'depends-on',
        })
      })
    })

    agents.forEach((agent) => {
      agent.dependencies?.forEach((dep) => {
        edges.push({
          id: `${agent.name}-${dep}`,
          source: agent.name,
          target: dep,
          type: 'depends-on',
        })
      })
    })

    return { nodes, edges }
  })
}
