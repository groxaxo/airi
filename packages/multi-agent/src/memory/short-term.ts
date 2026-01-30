/**
 * Short-Term Memory
 *
 * Working memory for current conversation and world state.
 */

import type { ShortTermMemoryEntry } from '../types'

import { nanoid } from 'nanoid'

/**
 * ShortTermMemory provides working memory for an agent's current context.
 */
export class ShortTermMemory {
  private entries: ShortTermMemoryEntry[] = []
  private capacity: number

  constructor(capacity: number = 100) {
    this.capacity = capacity
  }

  /**
   * Add a new entry to short-term memory
   */
  addEntry(entry: Omit<ShortTermMemoryEntry, 'id' | 'timestamp'>): ShortTermMemoryEntry {
    const fullEntry: ShortTermMemoryEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      ...entry,
    }

    this.entries.push(fullEntry)

    // Trim if over capacity
    if (this.entries.length > this.capacity) {
      this.entries = this.entries.slice(-this.capacity)
    }

    return fullEntry
  }

  /**
   * Get recent entries
   */
  getRecentEntries(count: number = 10): ShortTermMemoryEntry[] {
    return this.entries.slice(-count)
  }

  /**
   * Get all entries
   */
  getAllEntries(): ShortTermMemoryEntry[] {
    return [...this.entries]
  }

  /**
   * Get entries by type
   */
  getEntriesByType(type: ShortTermMemoryEntry['type']): ShortTermMemoryEntry[] {
    return this.entries.filter(e => e.type === type)
  }

  /**
   * Get entries by agent
   */
  getEntriesByAgent(agentId: string): ShortTermMemoryEntry[] {
    return this.entries.filter(e => e.agentId === agentId)
  }

  /**
   * Get entries since a timestamp
   */
  getEntriesSince(timestamp: number): ShortTermMemoryEntry[] {
    return this.entries.filter(e => e.timestamp >= timestamp)
  }

  /**
   * Search entries by content
   */
  searchEntries(query: string): ShortTermMemoryEntry[] {
    const lowerQuery = query.toLowerCase()
    return this.entries.filter(e => e.content.toLowerCase().includes(lowerQuery))
  }

  /**
   * Remove an entry by ID
   */
  removeEntry(id: string): boolean {
    const index = this.entries.findIndex(e => e.id === id)
    if (index >= 0) {
      this.entries.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = []
  }

  /**
   * Get current entry count
   */
  get size(): number {
    return this.entries.length
  }

  /**
   * Export entries for persistence or summarization
   */
  export(): ShortTermMemoryEntry[] {
    return this.getAllEntries()
  }

  /**
   * Import entries (e.g., from persistence)
   */
  import(entries: ShortTermMemoryEntry[]): void {
    this.entries = [...entries].slice(-this.capacity)
  }

  /**
   * Create a summary of recent memory for context
   */
  createContextSummary(maxEntries: number = 5): string {
    const recent = this.getRecentEntries(maxEntries)
    if (recent.length === 0) {
      return ''
    }

    return recent
      .map((entry) => {
        const typeLabel = entry.type.charAt(0).toUpperCase() + entry.type.slice(1)
        return `[${typeLabel}] ${entry.content}`
      })
      .join('\n')
  }
}
