import { ipcMain } from 'electron'
import { getProviderManager } from '../services/provider-manager'
import type { Provider } from '../../shared/types'

/**
 * Register IPC handlers for provider management
 */
export function registerProviderHandlers() {
  const providerManager = getProviderManager()

  // Get all providers
  ipcMain.handle('providers:getAll', async () => {
    try {
      console.log('[IPC] providers:getAll called')
      const providers = await providerManager.getProviders()
      console.log('[IPC] Found', providers.length, 'providers')
      return providers
    } catch (error) {
      console.error('[IPC] Error getting providers:', error)
      return []
    }
  })

  // Get active provider
  ipcMain.handle('providers:getActive', async () => {
    try {
      console.log('[IPC] providers:getActive called')
      const provider = await providerManager.getActiveProvider()
      console.log('[IPC] Active provider:', provider?.name || 'none')
      return provider
    } catch (error) {
      console.error('[IPC] Error getting active provider:', error)
      return null
    }
  })

  // Add new provider
  ipcMain.handle('providers:add', async (_, provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      console.log('[IPC] providers:add called:', provider.name)
      const newProvider = await providerManager.addProvider(provider)
      console.log('[IPC] Provider added:', newProvider.id)
      return newProvider
    } catch (error) {
      console.error('[IPC] Error adding provider:', error)
      throw error
    }
  })

  // Update provider
  ipcMain.handle('providers:update', async (_, id: string, updates: Partial<Provider>) => {
    try {
      console.log('[IPC] providers:update called:', id)
      const updatedProvider = await providerManager.updateProvider(id, updates)
      console.log('[IPC] Provider updated:', id)
      return updatedProvider
    } catch (error) {
      console.error('[IPC] Error updating provider:', error)
      throw error
    }
  })

  // Delete provider
  ipcMain.handle('providers:delete', async (_, id: string) => {
    try {
      console.log('[IPC] providers:delete called:', id)
      await providerManager.deleteProvider(id)
      console.log('[IPC] Provider deleted:', id)
      return true
    } catch (error) {
      console.error('[IPC] Error deleting provider:', error)
      throw error
    }
  })

  // Switch provider
  ipcMain.handle('providers:switch', async (_, id: string) => {
    try {
      console.log('[IPC] providers:switch called:', id)
      const provider = await providerManager.switchProvider(id)
      console.log('[IPC] Switched to provider:', provider.name)
      return provider
    } catch (error) {
      console.error('[IPC] Error switching provider:', error)
      throw error
    }
  })

  // Read from Claude settings (backfill)
  ipcMain.handle('providers:readClaudeSettings', async () => {
    try {
      console.log('[IPC] providers:readClaudeSettings called')
      const apiKey = await providerManager.readFromClaudeSettings()
      console.log('[IPC] Read API key from Claude settings:', apiKey ? 'exists' : 'none')
      return apiKey
    } catch (error) {
      console.error('[IPC] Error reading Claude settings:', error)
      return null
    }
  })

  console.log('[IPC] Provider handlers registered')
}
