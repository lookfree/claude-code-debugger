import type { IpcMain } from 'electron'
import type { FileManager } from '../services/file-manager'
import type { Skill } from '../../shared/types'

export function registerSkillHandlers(ipcMain: IpcMain, fileManager: FileManager) {
  ipcMain.handle('skills:getAll', async () => {
    console.log('[IPC] skills:getAll called')
    const skills = await fileManager.getSkills()
    console.log('[IPC] Found', skills.length, 'skills')
    return skills
  })

  ipcMain.handle('skills:get', async (_event, name: string) => {
    return await fileManager.getSkill(name)
  })

  ipcMain.handle('skills:save', async (_event, skill: Skill) => {
    await fileManager.saveSkill(skill)
  })

  ipcMain.handle('skills:delete', async (_event, name: string) => {
    await fileManager.deleteSkill(name)
  })
}
