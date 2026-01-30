import { describe, expect, it } from 'vitest'

import { LongTermMemory } from './long-term'

describe('longTermMemory', () => {
  it('should store and retrieve entries', () => {
    const memory = new LongTermMemory('alice')

    const entry = memory.store({
      type: 'fact',
      content: 'Important fact',
      importance: 0.8,
    })

    expect(entry).not.toBeNull()
    expect(entry?.id).toBeDefined()
    expect(entry?.agentId).toBe('alice')
    expect(entry?.content).toBe('Important fact')

    const retrieved = memory.retrieve(entry!.id)
    expect(retrieved).toEqual(entry)
  })

  it('should reject entries below importance threshold', () => {
    const memory = new LongTermMemory('alice', { minImportance: 0.5 })

    const entry = memory.store({
      type: 'fact',
      content: 'Low importance fact',
      importance: 0.3,
    })

    expect(entry).toBeNull()
    expect(memory.size).toBe(0)
  })

  it('should update entries', async () => {
    const memory = new LongTermMemory('alice')

    const entry = memory.store({
      type: 'fact',
      content: 'Original',
      importance: 0.8,
    })

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 5))

    const updated = memory.update(entry!.id, { content: 'Updated' })
    expect(updated).toBe(true)

    const retrieved = memory.retrieve(entry!.id)
    expect(retrieved?.content).toBe('Updated')
    expect(retrieved?.updatedAt).toBeGreaterThanOrEqual(retrieved!.createdAt)
  })

  it('should retrieve entries by type', () => {
    const memory = new LongTermMemory('alice')

    memory.store({ type: 'fact', content: 'fact1', importance: 0.8 })
    memory.store({ type: 'event', content: 'event1', importance: 0.8 })
    memory.store({ type: 'fact', content: 'fact2', importance: 0.8 })

    const facts = memory.retrieveByType('fact')
    expect(facts).toHaveLength(2)
    expect(facts.every(e => e.type === 'fact')).toBe(true)
  })

  it('should search entries by content', () => {
    const memory = new LongTermMemory('alice')

    memory.store({ type: 'fact', content: 'Alice likes apples', importance: 0.8 })
    memory.store({ type: 'fact', content: 'Bob likes bananas', importance: 0.7 })
    memory.store({ type: 'fact', content: 'Alice dislikes oranges', importance: 0.6 })

    const results = memory.search('alice')
    expect(results).toHaveLength(2)
    // Should be sorted by importance
    expect(results[0].importance).toBeGreaterThanOrEqual(results[1].importance)
  })

  it('should find most relevant entries', () => {
    const memory = new LongTermMemory('alice')

    memory.store({ type: 'fact', content: 'low', importance: 0.4 })
    memory.store({ type: 'fact', content: 'high', importance: 0.9 })
    memory.store({ type: 'fact', content: 'medium', importance: 0.6 })

    const relevant = memory.findRelevant(2)
    expect(relevant).toHaveLength(2)
    expect(relevant[0].content).toBe('high')
    expect(relevant[1].content).toBe('medium')
  })

  it('should enforce max entries limit', () => {
    const memory = new LongTermMemory('alice', { maxEntries: 3, minImportance: 0 })

    memory.store({ type: 'fact', content: '1', importance: 0.5 })
    memory.store({ type: 'fact', content: '2', importance: 0.3 })
    memory.store({ type: 'fact', content: '3', importance: 0.7 })
    memory.store({ type: 'fact', content: '4', importance: 0.9 })

    expect(memory.size).toBe(3)

    // Should have kept highest importance entries
    const all = memory.retrieveAll()
    const importances = all.map(e => e.importance).sort((a, b) => b - a)
    expect(importances).toEqual([0.9, 0.7, 0.5])
  })

  it('should apply TTL to low-value entries', () => {
    const memory = new LongTermMemory('alice', {
      minImportance: 0,
      ttlLowValueMs: 1000,
      lowValueThreshold: 0.5,
    })

    // Store an entry with low importance
    const entry = memory.store({ type: 'fact', content: 'low value', importance: 0.3 })

    // Manually backdate the entry
    if (entry) {
      entry.createdAt = Date.now() - 2000
    }

    const removed = memory.applyTTL()
    expect(removed).toBe(1)
    expect(memory.size).toBe(0)
  })

  it('should export and import entries', () => {
    const memory1 = new LongTermMemory('alice')

    memory1.store({ type: 'fact', content: 'fact1', importance: 0.8 })
    memory1.store({ type: 'event', content: 'event1', importance: 0.9 })

    const exported = memory1.export()

    const memory2 = new LongTermMemory('alice')
    memory2.import(exported)

    expect(memory2.size).toBe(2)
    expect(memory2.retrieveAll()).toEqual(exported)
  })

  it('should create summary from entries', () => {
    const memory = new LongTermMemory('alice')

    const e1 = memory.store({ type: 'fact', content: 'Fact one', importance: 0.8 })
    const e2 = memory.store({ type: 'fact', content: 'Fact two', importance: 0.9 })

    const summary = memory.summarize([e1!.id, e2!.id])
    expect(summary).toContain('- Fact one')
    expect(summary).toContain('- Fact two')
  })

  it('should ingest from short-term memory', () => {
    const memory = new LongTermMemory('alice', { minImportance: 0 })

    const shortTermEntries = [
      { id: '1', timestamp: Date.now(), type: 'message' as const, content: 'msg', agentId: 'alice' },
      { id: '2', timestamp: Date.now(), type: 'action' as const, content: 'act', agentId: 'alice' },
    ]

    const ingested = memory.ingestFromShortTerm(shortTermEntries)
    expect(ingested).toBe(2)
    expect(memory.size).toBe(2)
  })
})
