import type { DualConversationAgent, DualConversationMessage, DualConversationSnapshot } from './dual-conversation-runtime'

import { describe, expect, it, vi } from 'vitest'

import { DualConversationRuntime } from './dual-conversation-runtime'

function createAgent(
  side: 'left' | 'right',
  replies: string[],
  receivedMessages: DualConversationMessage[][],
  speechOrder: string[],
): DualConversationAgent {
  return {
    side,
    name: side === 'left' ? 'Airi' : 'ReLU',
    systemPrompt: `${side} system prompt`,
    generate: vi.fn(async (messages, options) => {
      receivedMessages.push(messages)
      const reply = replies.shift() ?? ''
      options.onDelta(reply.slice(0, 2))
      options.onDelta(reply.slice(2))
      return reply
    }),
    speak: vi.fn(async (text) => {
      speechOrder.push(`${side}:${text}`)
    }),
  }
}

describe('dualConversationRuntime', () => {
  it('alternates exactly two agents until the turn limit', async () => {
    const receivedMessages: DualConversationMessage[][] = []
    const speechOrder: string[] = []
    const snapshots: DualConversationSnapshot[] = []
    const runtime = new DualConversationRuntime({
      agents: [
        createAgent('left', ['Hello there.', 'I agree.'], receivedMessages, speechOrder),
        createAgent('right', ['Good to meet you.', 'Let us continue.'], receivedMessages, speechOrder),
      ],
      onStateChange: snapshot => snapshots.push(snapshot),
    })

    const result = await runtime.start({ seed: 'Discuss a new idea.', turnLimit: 4 })

    expect(result.phase).toBe('completed')
    expect(result.turns.map(turn => turn.side)).toEqual(['left', 'right', 'left', 'right'])
    expect(result.turns.map(turn => turn.text)).toEqual([
      'Hello there.',
      'Good to meet you.',
      'I agree.',
      'Let us continue.',
    ])
    expect(result.turns.every(turn => turn.status === 'complete')).toBe(true)
    expect(speechOrder).toEqual([
      'left:Hello there.',
      'right:Good to meet you.',
      'left:I agree.',
      'right:Let us continue.',
    ])
    expect(snapshots.some(snapshot => snapshot.phase === 'generating' && snapshot.turns[0]?.text === 'He')).toBe(true)
  })

  it('builds role history from each agent perspective', async () => {
    const leftMessages: DualConversationMessage[][] = []
    const rightMessages: DualConversationMessage[][] = []
    const runtime = new DualConversationRuntime({
      agents: [
        createAgent('left', ['Left one', 'Left two'], leftMessages, []),
        createAgent('right', ['Right one'], rightMessages, []),
      ],
    })

    await runtime.start({ seed: 'Begin here.', turnLimit: 3 })

    expect(rightMessages[0]?.map(message => message.role)).toEqual(['system', 'user'])
    expect(rightMessages[0]?.[1]?.content).toBe('The first message is: Begin here.\n\nAiri: Left one')
    expect(leftMessages[1]?.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(leftMessages[1]?.slice(1)).toEqual([
      { role: 'user', content: 'The first message is: Begin here.' },
      { role: 'assistant', content: 'Left one' },
      { role: 'user', content: 'ReLU: Right one' },
    ])
  })

  it('starts sentence speech before the model finishes streaming the reply', async () => {
    let finishGeneration: (() => void) | undefined
    let firstSentenceSpoken: (() => void) | undefined
    const generationGate = new Promise<void>(resolve => finishGeneration = resolve)
    const speechStarted = new Promise<void>(resolve => firstSentenceSpoken = resolve)
    const left: DualConversationAgent = {
      side: 'left',
      name: 'Airi',
      systemPrompt: '',
      generate: async (_messages, options) => {
        options.onDelta('First sentence. ')
        await generationGate
        options.onDelta('Second sentence.')
        return 'First sentence. Second sentence.'
      },
      speak: vi.fn(async (text) => {
        if (text === 'First sentence.')
          firstSentenceSpoken?.()
      }),
    }
    const runtime = new DualConversationRuntime({
      agents: [left, createAgent('right', ['Unused'], [], [])],
    })

    const resultPromise = runtime.start({ seed: 'Begin.', turnLimit: 1 })
    await speechStarted
    expect(left.speak).toHaveBeenCalledWith('First sentence.', expect.any(AbortSignal))
    finishGeneration?.()
    const result = await resultPromise

    expect(result.phase).toBe('completed')
    expect(left.speak).toHaveBeenLastCalledWith('Second sentence.', expect.any(AbortSignal))
  })

  it('caps long speech chunks at 25 words', async () => {
    const reply = Array.from({ length: 31 }, (_, index) => `word${index + 1}`).join(' ')
    const left = createAgent('left', [reply], [], [])
    const runtime = new DualConversationRuntime({
      agents: [left, createAgent('right', ['Unused'], [], [])],
    })

    await runtime.start({ seed: 'Begin.', turnLimit: 1 })

    expect(left.speak).toHaveBeenCalledTimes(2)
    expect(vi.mocked(left.speak).mock.calls[0][0].split(' ')).toHaveLength(25)
    expect(vi.mocked(left.speak).mock.calls[1][0].split(' ')).toHaveLength(6)
  })

  it('aborts the active generation and does not start speech', async () => {
    let generationStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve
    })
    const speak = vi.fn(async () => {})
    const left: DualConversationAgent = {
      side: 'left',
      name: 'Airi',
      systemPrompt: '',
      generate: (_messages, options) => new Promise((_resolve, reject) => {
        generationStarted?.()
        options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true })
      }),
      speak,
    }
    const right = createAgent('right', ['Unused'], [], [])
    const runtime = new DualConversationRuntime({ agents: [left, right] })

    const resultPromise = runtime.start({ seed: 'Keep talking.', turnLimit: 4 })
    await started
    runtime.stop()
    const result = await resultPromise

    expect(result.phase).toBe('stopped')
    expect(result.activeSide).toBeUndefined()
    expect(speak).not.toHaveBeenCalled()
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0].status).toBe('interrupted')
  })

  it('keeps alternating with a zero reply limit until stopped', async () => {
    let runtime: DualConversationRuntime
    let spokenReplies = 0
    const createContinuousAgent = (side: 'left' | 'right'): DualConversationAgent => ({
      side,
      name: side,
      systemPrompt: '',
      generate: async (_messages, options) => {
        const reply = `${side} reply.`
        options.onDelta(reply)
        return reply
      },
      speak: vi.fn(async () => {
        spokenReplies += 1
        if (spokenReplies === 2)
          runtime.stop()
      }),
    })
    runtime = new DualConversationRuntime({
      agents: [createContinuousAgent('left'), createContinuousAgent('right')],
    })

    const result = await runtime.start({ seed: 'Continue.', turnLimit: 0 })

    expect(result.phase).toBe('stopped')
    expect(result.turns.map(turn => turn.side)).toEqual(['left', 'right'])
  })

  it('rejects duplicate sides and unsafe turn limits', async () => {
    const left = createAgent('left', ['Unused'], [], [])

    expect(() => new DualConversationRuntime({ agents: [left, left] })).toThrow(
      'Dual conversation requires one left agent and one right agent',
    )

    const runtime = new DualConversationRuntime({
      agents: [left, createAgent('right', ['Unused'], [], [])],
    })
    await expect(runtime.start({ seed: 'Hello', turnLimit: 101 })).rejects.toThrow(
      'Turn limit must be an integer from 0 to 100',
    )
  })
})
