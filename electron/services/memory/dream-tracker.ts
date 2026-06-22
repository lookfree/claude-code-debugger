import { app } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { MemorySnapshot, DreamChange } from '../../../shared/types/memory'

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')

function snapshotDir(): string {
  return path.join(app.getPath('userData'), 'memory-snapshots')
}

export async function snapshotMemory(encodedCwd: string): Promise<MemorySnapshot> {
  const memDir = path.resolve(PROJECTS_DIR, encodedCwd, 'memory')
  if (!memDir.startsWith(PROJECTS_DIR + path.sep)) throw new Error('invalid_cwd')
  const files: Array<{ file: string; content: string }> = []

  try {
    const entries = await fs.readdir(memDir)
    await Promise.all(
      entries
        .filter((f) => f.endsWith('.md'))
        .map(async (fname) => {
          try {
            const content = await fs.readFile(path.join(memDir, fname), 'utf-8')
            files.push({ file: fname, content })
          } catch {
            // skip unreadable
          }
        })
    )
  } catch {
    // memory dir doesn't exist — empty snapshot is valid
  }

  files.sort((a, b) => a.file.localeCompare(b.file))

  const id = `${encodedCwd}__${Date.now()}`
  const snapshot: MemorySnapshot = {
    id,
    takenAt: new Date().toISOString(),
    encodedCwd,
    files,
  }

  const sDir = snapshotDir()
  await fs.mkdir(sDir, { recursive: true })
  await fs.writeFile(path.join(sDir, `${id}.json`), JSON.stringify(snapshot, null, 2), 'utf-8')
  return snapshot
}

export async function listSnapshots(encodedCwd: string): Promise<MemorySnapshot[]> {
  const dir = snapshotDir()
  try {
    const entries = await fs.readdir(dir)
    const prefix = `${encodedCwd}__`
    const snapshots: MemorySnapshot[] = []
    await Promise.all(
      entries
        .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
        .map(async (fname) => {
          try {
            const raw = await fs.readFile(path.join(dir, fname), 'utf-8')
            snapshots.push(JSON.parse(raw))
          } catch {
            // skip corrupt
          }
        })
    )
    snapshots.sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    return snapshots
  } catch {
    return []
  }
}

export async function loadSnapshot(id: string): Promise<MemorySnapshot | null> {
  const dir = snapshotDir()
  const p = path.resolve(dir, `${id}.json`)
  if (!p.startsWith(dir + path.sep)) return null
  try {
    const raw = await fs.readFile(p, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  const dir = snapshotDir()
  const p = path.resolve(dir, `${id}.json`)
  if (!p.startsWith(dir + path.sep)) return
  try {
    await fs.unlink(p)
  } catch {
    // ignore
  }
}

export function diffMemory(before: MemorySnapshot, after: MemorySnapshot): DreamChange[] {
  const changes: DreamChange[] = []
  const beforeMap = new Map(before.files.map((f) => [f.file, f.content]))
  const afterMap = new Map(after.files.map((f) => [f.file, f.content]))

  for (const [file, beforeText] of beforeMap) {
    if (!afterMap.has(file)) {
      changes.push({ type: 'deleted', file, detail: `Removed (${beforeText.length} chars)`, beforeText })
    } else {
      const afterText = afterMap.get(file)!
      if (afterText !== beforeText) {
        changes.push({ type: 'modified', file, detail: 'Content changed', beforeText, afterText })
      }
    }
  }
  for (const [file, afterText] of afterMap) {
    if (!beforeMap.has(file)) {
      changes.push({ type: 'added', file, detail: `Added (${afterText.length} chars)`, afterText })
    }
  }
  return changes.sort((a, b) => a.file.localeCompare(b.file))
}
