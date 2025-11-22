import type { IpcMain } from 'electron'
import type { FileManager } from '../services/file-manager'
import type { Agent } from '../../shared/types'

export function registerAgentHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('agents:getAll', async () => {
    return await fileManager.getAgents()
  })

  ipcMain.handle('agents:get', async (_event, name: string) => {
    return await fileManager.getAgent(name)
  })

  ipcMain.handle('agents:save', async (_event, agent: Agent) => {
    await fileManager.saveAgent(agent)
  })

  ipcMain.handle('agents:delete', async (_event, name: string) => {
    await fileManager.deleteAgent(name)
  })
}
