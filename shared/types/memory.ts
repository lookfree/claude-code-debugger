export interface MemoryStore {
  cwd: string
  encodedCwd: string
  dir: string
  index: MemoryIndexEntry[]
  topics: MemoryTopic[]
  lastModifiedAt: string
}

export interface MemoryIndexEntry {
  title: string
  file: string
  summary?: string
}

export interface MemoryTopic {
  file: string
  title?: string
  content: string
  sizeBytes: number
  modifiedAt: string
  referenced: boolean
}

export interface MemorySnapshot {
  id: string
  takenAt: string
  encodedCwd: string
  files: Array<{ file: string; content: string }>
}

export interface DreamChange {
  type: 'merged' | 'deleted' | 'added' | 'resolved-conflict' | 'modified'
  file: string
  detail: string
  beforeText?: string
  afterText?: string
}
