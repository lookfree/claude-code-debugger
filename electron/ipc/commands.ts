import type { IpcMain } from 'electron'
import type { FileManager } from '../services/file-manager'
import type { SlashCommand } from '../../shared/types'

// Safe logger that handles EPIPE errors gracefully
const safeLog = (level: 'log' | 'error', ...args: unknown[]) => {
  try {
    console[level](...args)
  } catch {
    // Ignore EPIPE errors when stdout/stderr is closed
  }
}

export function registerCommandHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('commands:getAll', async () => {
    return await fileManager.getCommands()
  })

  ipcMain.handle('commands:get', async (_event, name: string) => {
    return await fileManager.getCommand(name)
  })

  ipcMain.handle('commands:save', async (_event, command: SlashCommand) => {
    safeLog('log', '[IPC] commands:save called with:', JSON.stringify(command, null, 2))
    await fileManager.saveCommand(command)
    safeLog('log', '[IPC] commands:save completed')
  })

  ipcMain.handle('commands:saveRaw', async (_event, name: string, content: string, filePath: string) => {
    safeLog('log', '[IPC] commands:saveRaw called for:', name, 'at:', filePath)
    await fileManager.saveCommandRaw(name, content, filePath)
    safeLog('log', '[IPC] commands:saveRaw completed')
  })

  ipcMain.handle('commands:delete', async (_event, name: string) => {
    await fileManager.deleteCommand(name)
  })
}
