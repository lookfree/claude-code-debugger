import type { IpcMain } from 'electron'
import type { FileManager } from '../services/file-manager'
import type { SlashCommand } from '../../shared/types'

export function registerCommandHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('commands:getAll', async () => {
    return await fileManager.getCommands()
  })

  ipcMain.handle('commands:get', async (_event, name: string) => {
    return await fileManager.getCommand(name)
  })

  ipcMain.handle('commands:save', async (_event, command: SlashCommand) => {
    await fileManager.saveCommand(command)
  })

  ipcMain.handle('commands:delete', async (_event, name: string) => {
    await fileManager.deleteCommand(name)
  })
}
