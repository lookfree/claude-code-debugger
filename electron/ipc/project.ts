import type { IpcMain, dialog } from 'electron'
import type { FileManager } from '../services/file-manager'

export function registerProjectHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('project:getContext', async () => {
    return await fileManager.getProjectContext()
  })

  ipcMain.handle('project:selectPath', async () => {
    // Import dialog dynamically to avoid issues
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0]
      fileManager.setProjectPath(selectedPath)
      return selectedPath
    }

    return null
  })
}
