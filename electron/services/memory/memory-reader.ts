import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { MemoryStore, MemoryIndexEntry, MemoryTopic } from '../../../shared/types/memory'
import { decodeCwd } from '../session/session-path'

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
const INDEX_RE = /^- \[(.+?)\]\((.+?)\)(?:\s*[—-]\s*(.+))?$/

async function parseMemoryIndex(content: string): Promise<MemoryIndexEntry[]> {
  const entries: MemoryIndexEntry[] = []
  for (const line of content.split('\n')) {
    const m = line.trim().match(INDEX_RE)
    if (m) entries.push({ title: m[1], file: m[2], summary: m[3]?.trim() })
  }
  return entries
}

export async function readMemoryStore(encodedCwd: string): Promise<MemoryStore | null> {
  const dir = path.resolve(PROJECTS_DIR, encodedCwd, 'memory')
  if (!dir.startsWith(PROJECTS_DIR + path.sep)) return null
  try {
    await fs.access(dir)
  } catch {
    return null
  }

  const indexPath = path.join(dir, 'MEMORY.md')
  let indexEntries: MemoryIndexEntry[] = []
  let lastModifiedAt = new Date(0).toISOString()
  try {
    const [content, stat] = await Promise.all([fs.readFile(indexPath, 'utf-8'), fs.stat(indexPath)])
    indexEntries = await parseMemoryIndex(content)
    const t = stat.mtime.toISOString()
    if (t > lastModifiedAt) lastModifiedAt = t
  } catch {
    // MEMORY.md missing or unreadable — treat as empty
  }

  // indexOrder doubles as the referenced-files set (has() checks)
  const indexOrder = new Map(indexEntries.map((e, i) => [e.file, i]))
  const topics: MemoryTopic[] = []

  try {
    const entries = await fs.readdir(dir)
    for (const fname of entries) {
      if (!fname.endsWith('.md') || fname === 'MEMORY.md') continue
      const fpath = path.join(dir, fname)
      try {
        const [content, stat] = await Promise.all([fs.readFile(fpath, 'utf-8'), fs.stat(fpath)])
        const modifiedAt = stat.mtime.toISOString()
        if (modifiedAt > lastModifiedAt) lastModifiedAt = modifiedAt
        const firstHeading = content.match(/^#{1,3} (.+)/m)?.[1]
        const indexEntry = indexEntries.find((e) => e.file === fname)
        topics.push({
          file: fname,
          title: indexEntry?.title ?? firstHeading,
          content,
          sizeBytes: Buffer.byteLength(content, 'utf-8'),
          modifiedAt,
          referenced: indexOrder.has(fname),
        })
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // readdir failed — return what we have
  }

  // Sort: indexed first (in index order), then orphans alphabetically
  topics.sort((a, b) => {
    const ia = indexOrder.get(a.file) ?? Infinity
    const ib = indexOrder.get(b.file) ?? Infinity
    if (ia !== ib) return ia - ib
    return a.file.localeCompare(b.file)
  })

  return {
    cwd: decodeCwd(encodedCwd),
    encodedCwd,
    dir,
    index: indexEntries,
    topics,
    lastModifiedAt,
  }
}

export async function listMemoryStores(): Promise<MemoryStore[]> {
  const stores: MemoryStore[] = []
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR)
    await Promise.all(
      projectDirs.map(async (encodedCwd) => {
        const store = await readMemoryStore(encodedCwd)
        if (store) stores.push(store)
      })
    )
  } catch {
    // ~/.claude/projects doesn't exist
  }
  stores.sort((a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt))
  return stores
}
