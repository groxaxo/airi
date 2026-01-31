/**
 * Long-Term Memory
 *
 * Persistent memory for storing important events, summaries, and facts.
 */

import type { LongTermMemoryEntry, ShortTermMemoryEntry } from '../types'

import { nanoid } from 'nanoid'

/**
 * Memory write policy configuration
 */
export interface MemoryWritePolicy {
  /** Minimum importance score to store (0-1) */
  minImportance: number
  /** Whether to summarize before storing */
  summarize: boolean
  /** Maximum entries to keep */
  maxEntries: number
  /** TTL for low-value items in milliseconds */
  ttlLowValueMs?: number
  /** Importance threshold below which TTL applies */
  lowValueThreshold?: number
}

const DEFAULT_POLICY: MemoryWritePolicy = {
  minImportance: 0.3,
  summarize: true,
  maxEntries: 1000,
  ttlLowValueMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  lowValueThreshold: 0.5,
}

/**
 * LongTermMemory provides persistent storage for important information.
 */
export class LongTermMemory {
  private entries: Map<string, LongTermMemoryEntry> = new Map()
  private agentId: string
  private policy: MemoryWritePolicy

  constructor(agentId: string, policy: Partial<MemoryWritePolicy> = {}) {
    this.agentId = agentId
    this.policy = { ...DEFAULT_POLICY, ...policy }
  }

  /**
   * Store a new memory entry
   */
  store(entry: Omit<LongTermMemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'agentId'>): LongTermMemoryEntry | null {
    // Check importance threshold
    if (entry.importance < this.policy.minImportance) {
      return null
    }

    const fullEntry: LongTermMemoryEntry = {
      id: nanoid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agentId: this.agentId,
      ...entry,
    }

    this.entries.set(fullEntry.id, fullEntry)

    // Enforce max entries
    this.enforceLimit()

    return fullEntry
  }

  /**
   * Update an existing entry
   */
  update(id: string, updates: Partial<Pick<LongTermMemoryEntry, 'content' | 'importance' | 'metadata'>>): boolean {
    const entry = this.entries.get(id)
    if (!entry) {
      return false
    }

    Object.assign(entry, updates, { updatedAt: Date.now() })
    return true
  }

  /**
   * Retrieve an entry by ID
   */
  retrieve(id: string): LongTermMemoryEntry | undefined {
    return this.entries.get(id)
  }

  /**
   * Retrieve all entries
   */
  retrieveAll(): LongTermMemoryEntry[] {
    return Array.from(this.entries.values())
  }

  /**
   * Retrieve entries by type
   */
  retrieveByType(type: LongTermMemoryEntry['type']): LongTermMemoryEntry[] {
    return this.retrieveAll().filter(e => e.type === type)
  }

  /**
   * Search entries by content (simple text search)
   */
  search(query: string): LongTermMemoryEntry[] {
    const lowerQuery = query.toLowerCase()
    return this.retrieveAll()
      .filter(e => e.content.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.importance - a.importance)
  }

  /**
   * Find most relevant entries (sorted by importance)
   */
  findRelevant(count: number = 10): LongTermMemoryEntry[] {
    return this.retrieveAll()
      .sort((a, b) => b.importance - a.importance)
      .slice(0, count)
  }

  /**
   * Delete an entry
   */
  delete(id: string): boolean {
    return this.entries.delete(id)
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear()
  }

  /**
   * Get entry count
   */
  get size(): number {
    return this.entries.size
  }

  /**
   * Ingest entries from short-term memory
   */
  ingestFromShortTerm(entries: ShortTermMemoryEntry[], importanceScorer?: (entry: ShortTermMemoryEntry) => number): number {
    let ingested = 0

    for (const shortEntry of entries) {
      const importance = importanceScorer?.(shortEntry) ?? this.defaultImportanceScore(shortEntry)

      const stored = this.store({
        type: this.mapShortTermType(shortEntry.type),
        content: shortEntry.content,
        importance,
        metadata: shortEntry.metadata,
      })

      if (stored) {
        ingested++
      }
    }

    return ingested
  }

  /**
   * Create a summary from multiple entries
   */
  summarize(entryIds: string[]): string {
    const entries = entryIds
      .map(id => this.entries.get(id))
      .filter((e): e is LongTermMemoryEntry => e !== undefined)
      .sort((a, b) => b.importance - a.importance)

    if (entries.length === 0) {
      return ''
    }

    return entries.map(e => `- ${e.content}`).join('\n')
  }

  /**
   * Apply TTL policy to clean up low-value entries
   */
  applyTTL(): number {
    const now = Date.now()
    let removed = 0

    if (!this.policy.ttlLowValueMs || !this.policy.lowValueThreshold) {
      return 0
    }

    for (const [id, entry] of this.entries) {
      if (
        entry.importance < this.policy.lowValueThreshold
        && now - entry.createdAt > this.policy.ttlLowValueMs
      ) {
        this.entries.delete(id)
        removed++
      }
    }

    return removed
  }

  /**
   * Export entries for persistence
   */
  export(): LongTermMemoryEntry[] {
    return this.retrieveAll()
  }

  /**
   * Import entries from persistence
   */
  import(entries: LongTermMemoryEntry[]): void {
    for (const entry of entries) {
      this.entries.set(entry.id, entry)
    }
    this.enforceLimit()
  }

  private enforceLimit(): void {
    if (this.entries.size <= this.policy.maxEntries) {
      return
    }

    // Remove lowest importance entries first
    const sorted = this.retrieveAll().sort((a, b) => a.importance - b.importance)
    const toRemove = sorted.slice(0, this.entries.size - this.policy.maxEntries)

    for (const entry of toRemove) {
      this.entries.delete(entry.id)
    }
  }

  private defaultImportanceScore(entry: ShortTermMemoryEntry): number {
    // Simple heuristic based on type and content length
    let score = 0.5

    switch (entry.type) {
      case 'action':
        score += 0.2
        break
      case 'thought':
        score += 0.1
        break
      case 'observation':
        score += 0.1
        break
      case 'message':
        score += 0.15
        break
    }

    // Longer content is potentially more important
    if (entry.content.length > 100) {
      score += 0.1
    }

    return Math.min(1, score)
  }

  private mapShortTermType(type: ShortTermMemoryEntry['type']): LongTermMemoryEntry['type'] {
    switch (type) {
      case 'action':
        return 'event'
      case 'thought':
        return 'fact'
      case 'observation':
        return 'event'
      case 'message':
        return 'event'
      default:
        return 'fact'
    }
  }
}
