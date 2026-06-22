import type { IpcMain } from 'electron'
import { listMemoryStores, readMemoryStore } from '../services/memory/memory-reader'
import {
  snapshotMemory, listSnapshots, loadSnapshot, deleteSnapshot, diffMemory,
} from '../services/memory/dream-tracker'

export function registerMemoryHandlers(ipcMain: IpcMain) {
  ipcMain.handle('memory:list', () => listMemoryStores())
  ipcMain.handle('memory:read', (_e, encodedCwd: string) => readMemoryStore(encodedCwd))
  ipcMain.handle('memory:snapshot', (_e, encodedCwd: string) => snapshotMemory(encodedCwd))
  ipcMain.handle('memory:listSnapshots', (_e, encodedCwd: string) => listSnapshots(encodedCwd))
  ipcMain.handle('memory:deleteSnapshot', (_e, id: string) => deleteSnapshot(id))
  ipcMain.handle('memory:diff', async (_e, beforeId: string, afterId: string) => {
    const [before, after] = await Promise.all([loadSnapshot(beforeId), loadSnapshot(afterId)])
    if (!before || !after) throw new Error('snapshot_not_found')
    return diffMemory(before, after)
  })
}
