import { describe, expect, it } from 'vitest'

import { ShortTermMemory } from './short-term'

describe('shortTermMemory', () => {
  it('should add and retrieve entries', () => {
    const memory = new ShortTermMemory(10)

    const entry = memory.addEntry({
      type: 'message',
      content: 'Hello, world!',
      agentId: 'alice',
    })

    expect(entry.id).toBeDefined()
    expect(entry.timestamp).toBeDefined()
    expect(entry.content).toBe('Hello, world!')

    const entries = memory.getAllEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual(entry)
  })

  it('should enforce capacity limit', () => {
    const memory = new ShortTermMemory(3)

    memory.addEntry({ type: 'message', content: '1', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: '2', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: '3', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: '4', agentId: 'alice' })

    const entries = memory.getAllEntries()
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.content)).toEqual(['2', '3', '4'])
  })

  it('should get recent entries', () => {
    const memory = new ShortTermMemory(10)

    memory.addEntry({ type: 'message', content: '1', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: '2', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: '3', agentId: 'alice' })

    const recent = memory.getRecentEntries(2)
    expect(recent.map(e => e.content)).toEqual(['2', '3'])
  })

  it('should filter entries by type', () => {
    const memory = new ShortTermMemory(10)

    memory.addEntry({ type: 'message', content: 'msg', agentId: 'alice' })
    memory.addEntry({ type: 'observation', content: 'obs', agentId: 'alice' })
    memory.addEntry({ type: 'action', content: 'act', agentId: 'alice' })

    const messages = memory.getEntriesByType('message')
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('msg')
  })

  it('should filter entries by agent', () => {
    const memory = new ShortTermMemory(10)

    memory.addEntry({ type: 'message', content: 'alice msg', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: 'bob msg', agentId: 'bob' })

    const aliceEntries = memory.getEntriesByAgent('alice')
    expect(aliceEntries).toHaveLength(1)
    expect(aliceEntries[0].content).toBe('alice msg')
  })

  it('should search entries by content', () => {
    const memory = new ShortTermMemory(10)

    memory.addEntry({ type: 'message', content: 'Hello world', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: 'Goodbye world', agentId: 'alice' })
    memory.addEntry({ type: 'message', content: 'Something else', agentId: 'alice' })

    const results = memory.searchEntries('world')
    expect(results).toHaveLength(2)
  })

  it('should remove entry by id', () => {
    const memory = new ShortTermMemory(10)

    const entry = memory.addEntry({ type: 'message', content: 'test', agentId: 'alice' })

    expect(memory.size).toBe(1)
    expect(memory.removeEntry(entry.id)).toBe(true)
    expect(memory.size).toBe(0)
  })

  it('should export and import entries', () => {
    const memory1 = new ShortTermMemory(10)

    memory1.addEntry({ type: 'message', content: '1', agentId: 'alice' })
    memory1.addEntry({ type: 'message', content: '2', agentId: 'alice' })

    const exported = memory1.export()

    const memory2 = new ShortTermMemory(10)
    memory2.import(exported)

    expect(memory2.getAllEntries()).toEqual(exported)
  })

  it('should create context summary', () => {
    const memory = new ShortTermMemory(10)

    memory.addEntry({ type: 'message', content: 'Hello', agentId: 'alice' })
    memory.addEntry({ type: 'observation', content: 'World', agentId: 'bob' })

    const summary = memory.createContextSummary(2)
    expect(summary).toContain('[Message] Hello')
    expect(summary).toContain('[Observation] World')
  })
})
