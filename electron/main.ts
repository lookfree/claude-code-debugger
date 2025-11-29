import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { FileManager } from './services/file-manager'
import { registerIPCHandlers } from './ipc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Handle EPIPE errors gracefully (when stdout/stderr is closed)
process.stdout?.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Ignore - pipe was closed (e.g., terminal disconnected)
    return
  }
  // Re-throw other errors
  throw err
})

process.stderr?.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Ignore - pipe was closed
    return
  }
  throw err
})

let mainWindow: BrowserWindow | null = null

const createWindow = () => {
  // In development and production, preload.cjs is in the same directory as main.js after build
  const preloadPath = path.join(__dirname, 'preload.cjs')
  console.log('[Main] __dirname:', __dirname)
  console.log('[Main] preload path:', preloadPath)
  console.log('[Main] preload exists:', fs.existsSync(preloadPath))

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
  })

  // Debug: Check webPreferences
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Page loaded')
    mainWindow?.webContents.executeJavaScript('console.log("[Main->Renderer] electronAPI:", window.electronAPI)')
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Main] Preload error:', preloadPath, error)
  })

  // Load the index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // Open DevTools in development
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Initialize services
  const fileManager = FileManager.getInstance()
  fileManager.initialize()

  // Register IPC handlers
  registerIPCHandlers(ipcMain, fileManager)

  createWindow()

  app.on('activate', () => {
    // On macOS, re-create a window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle app quit
app.on('will-quit', () => {
  const fileManager = FileManager.getInstance()
  fileManager.cleanup()
})
