import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import fs from 'fs'
import path from 'path'

// preload.cjs 是手写的 CommonJS 文件，不走 TS 编译，需在 electron 启动前拷到 dist-electron。
// 放在插件的 onstart 里执行，保证「拷 preload」一定先于「启动 electron」，消灭时序竞态。
function copyPreload() {
  const outDir = path.resolve(__dirname, 'dist-electron')
  fs.mkdirSync(outDir, { recursive: true })
  fs.copyFileSync(
    path.resolve(__dirname, 'electron/preload.cjs'),
    path.join(outDir, 'preload.cjs')
  )
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry file
        entry: 'electron/main.ts',
        // 提供 onstart 后插件不再自动启动 electron，改由我们控制：先拷 preload 再 startup，
        // 不再出现「插件自动起的 electron」与「脚本里 electron .」两个实例打架。
        onstart(args) {
          copyPreload()
          args.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'better-sqlite3', 'chokidar']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
      '@shared': path.resolve(__dirname, './shared')
    }
  },
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist'
  }
})
