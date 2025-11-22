import type { IpcMain } from 'electron'
import type { FileManager } from '../services/file-manager'

export function registerClaudeMDHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('claudemd:get', async () => {
    console.log('[IPC] claudemd:get called')
    return await fileManager.getClaudeMD()
  })

  ipcMain.handle('claudemd:getAll', async () => {
    console.log('[IPC] claudemd:getAll called')
    const files = await fileManager.getClaudeMDFiles()
    console.log('[IPC] Returning', files.length, 'CLAUDE.md files:', files.map(f => ({ location: f.location, exists: f.exists, path: f.filePath })))
    return files
  })

  ipcMain.handle('claudemd:save', async (_event, content: string, location: 'user' | 'project') => {
    console.log('[IPC] claudemd:save called for location:', location)
    await fileManager.saveClaudeMD(content, location)
  })
}
