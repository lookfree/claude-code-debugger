import type { IpcMain } from 'electron'
import type { FileManager } from '../services/file-manager'
import type { Hook } from '../../shared/types'

export function registerHookHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('hooks:getAll', async () => {
    return await fileManager.getHooks()
  })

  ipcMain.handle('hooks:get', async (_event, name: string) => {
    return await fileManager.getHook(name)
  })

  ipcMain.handle('hooks:save', async (_event, hook: Hook) => {
    await fileManager.saveHook(hook)
  })

  ipcMain.handle('hooks:delete', async (_event, name: string) => {
    await fileManager.deleteHook(name)
  })
}
