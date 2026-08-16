/** The two fixed positions supported by the conversation runtime. */
export type DualConversationSide = 'left' | 'right'

/**
 * Runtime lifecycle for one autonomous conversation.
 *
 * A run moves from `idle` to `generating` and `speaking` for each turn. It
 * ends in `completed`, `stopped`, or `failed`. A new start aborts and replaces
 * the active run. Abort cleanup marks any partial turn as interrupted.
 */
export type DualConversationPhase
  = | 'idle'
    | 'generating'
    | 'speaking'
    | 'stopped'
    | 'completed'
    | 'failed'

/** Translation-safe failures reported to the user interface. */
export type DualConversationFailureCode = 'conversation-failed'

/** One provider-safe message from one agent's view of the conversation. */
export interface DualConversationMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** One visible reply from either character, including interrupted partial text. */
export interface DualConversationTurn {
  id: number
  side: DualConversationSide
  speaker: string
  text: string
  status: 'streaming' | 'complete' | 'interrupted'
}

/** Detached observable state emitted while a conversation runs. */
export interface DualConversationSnapshot {
  phase: DualConversationPhase
  activeSide?: DualConversationSide
  errorCode?: DualConversationFailureCode
  seed: string
  turns: DualConversationTurn[]
}

/** Streaming controls supplied to one character generation adapter. */
export interface DualConversationGenerationOptions {
  signal: AbortSignal
  onDelta: (text: string) => void
}

/** One character runtime with its own model and voice boundaries. */
export interface DualConversationAgent {
  side: DualConversationSide
  name: string
  systemPrompt: string
  generate: (
    messages: DualConversationMessage[],
    options: DualConversationGenerationOptions,
  ) => Promise<string>
  speak: (text: string, signal: AbortSignal) => Promise<void>
}

/** User-controlled bounds for one autonomous conversation run. */
export interface DualConversationStartOptions {
  seed: string
  /**
   * Maximum reply count. `0` keeps alternating until the user stops the run.
   *
   * @default 0
   */
  turnLimit: number
  /**
   * Character that receives the first message.
   *
   * @default left
   */
  firstSide?: DualConversationSide
}

/** Dependencies required by the exactly-two-character runtime. */
export interface DualConversationRuntimeOptions {
  agents: readonly [DualConversationAgent, DualConversationAgent]
  onStateChange?: (snapshot: DualConversationSnapshot) => void
}

const MAX_TURN_LIMIT = 100
const SPEECH_CHUNK_WORD_LIMIT = 25

function splitByWordLimit(text: string) {
  const chunks: string[] = []
  let remainder = text
  let words = [...remainder.matchAll(/\S+/g)]

  while (words.length > SPEECH_CHUNK_WORD_LIMIT) {
    const lastWord = words[SPEECH_CHUNK_WORD_LIMIT - 1]
    const endIndex = (lastWord.index ?? 0) + lastWord[0].length
    chunks.push(remainder.slice(0, endIndex).trim())
    remainder = remainder.slice(endIndex)
    words = [...remainder.matchAll(/\S+/g)]
  }

  return {
    chunks,
    remainder,
  }
}

function extractCompleteSpeechChunks(text: string) {
  const chunks: string[] = []
  const sentencePattern = /(.+?[.!?…]["')\]]*)(?:\s+|$)/gs
  let consumedLength = 0
  let match = sentencePattern.exec(text)

  while (match) {
    const chunk = match[1].trim()
    if (chunk) {
      const boundedChunk = splitByWordLimit(chunk)
      chunks.push(...boundedChunk.chunks)
      if (boundedChunk.remainder.trim())
        chunks.push(boundedChunk.remainder.trim())
    }
    consumedLength = sentencePattern.lastIndex
    match = sentencePattern.exec(text)
  }

  const trailingText = splitByWordLimit(text.slice(consumedLength))
  chunks.push(...trailingText.chunks)

  return {
    chunks,
    remainder: trailingText.remainder,
  }
}

function otherSide(side: DualConversationSide): DualConversationSide {
  return side === 'left' ? 'right' : 'left'
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Runs one conversation between exactly two character runtimes.
 *
 * Each model receives the seed and transcript from its own role perspective.
 * Completed sentences enter speech while the model streams the rest of its
 * reply. All speech finishes before the other character starts its next turn.
 */
export class DualConversationRuntime {
  private readonly agents: Record<DualConversationSide, DualConversationAgent>
  private readonly onStateChange?: (snapshot: DualConversationSnapshot) => void
  private abortController?: AbortController
  private runId = 0
  private state: DualConversationSnapshot = {
    phase: 'idle',
    seed: '',
    turns: [],
  }

  constructor(options: DualConversationRuntimeOptions) {
    const [firstAgent, secondAgent] = options.agents
    if (firstAgent.side === secondAgent.side)
      throw new Error('Dual conversation requires one left agent and one right agent')

    this.agents = {
      [firstAgent.side]: firstAgent,
      [secondAgent.side]: secondAgent,
    } as Record<DualConversationSide, DualConversationAgent>
    this.onStateChange = options.onStateChange
  }

  /** Returns a detached snapshot of the current runtime state. */
  getSnapshot(): DualConversationSnapshot {
    return structuredClone(this.state)
  }

  /** Stops the active generation or speech operation. */
  stop() {
    if (!this.abortController)
      return

    this.abortController.abort()
    this.abortController = undefined
    this.interruptStreamingTurn()
    this.updateState({ phase: 'stopped', activeSide: undefined })
  }

  /** Starts a new alternating conversation and replaces any active run. */
  async start(options: DualConversationStartOptions): Promise<DualConversationSnapshot> {
    const seed = options.seed.trim()
    if (!seed)
      throw new Error('The first message is required')
    if (!Number.isInteger(options.turnLimit) || options.turnLimit < 0 || options.turnLimit > MAX_TURN_LIMIT)
      throw new Error(`Turn limit must be an integer from 0 to ${MAX_TURN_LIMIT}`)

    this.stop()
    const currentRunId = ++this.runId
    const abortController = new AbortController()
    this.abortController = abortController
    this.state = {
      phase: 'idle',
      seed,
      turns: [],
    }
    this.emitState()

    let side = options.firstSide ?? 'left'

    try {
      while (options.turnLimit === 0 || this.state.turns.length < options.turnLimit) {
        await this.runTurn(side, abortController.signal, currentRunId)
        side = otherSide(side)
      }

      if (this.isCurrentRun(currentRunId)) {
        this.abortController = undefined
        this.updateState({ phase: 'completed', activeSide: undefined })
      }
    }
    catch (error) {
      if (!this.isCurrentRun(currentRunId))
        return this.getSnapshot()

      this.abortController = undefined
      this.interruptStreamingTurn()
      if (abortController.signal.aborted || isAbortError(error)) {
        this.updateState({ phase: 'stopped', activeSide: undefined })
      }
      else {
        this.updateState({
          phase: 'failed',
          activeSide: undefined,
          errorCode: 'conversation-failed',
        })
      }
    }

    return this.getSnapshot()
  }

  private async runTurn(side: DualConversationSide, signal: AbortSignal, currentRunId: number) {
    const agent = this.agents[side]
    const turn: DualConversationTurn = {
      id: this.state.turns.length + 1,
      side,
      speaker: agent.name,
      text: '',
      status: 'streaming',
    }
    this.state.turns.push(turn)
    this.updateState({ phase: 'generating', activeSide: side, errorCode: undefined })

    let generationComplete = false
    let streamedText = ''
    let speechBuffer = ''
    let speechFailure: unknown
    let speechQueue = Promise.resolve()
    const queueSpeech = (text: string) => {
      const speechText = text.trim()
      if (!speechText)
        return

      speechQueue = speechQueue.then(async () => {
        if (speechFailure || signal.aborted || !this.isCurrentRun(currentRunId))
          return

        this.updateState({ phase: 'speaking', activeSide: side })
        try {
          await agent.speak(speechText, signal)
        }
        catch (error) {
          speechFailure = error
        }
        if (!generationComplete && !speechFailure && !signal.aborted)
          this.updateState({ phase: 'generating', activeSide: side })
      })
    }

    const generatedText = await agent.generate(this.buildMessages(side), {
      signal,
      onDelta: (text) => {
        if (!this.isCurrentRun(currentRunId) || signal.aborted)
          return
        turn.text += text
        streamedText += text
        speechBuffer += text
        const speechChunks = extractCompleteSpeechChunks(speechBuffer)
        speechBuffer = speechChunks.remainder
        speechChunks.chunks.forEach(queueSpeech)
        this.emitState()
      },
    })

    if (signal.aborted)
      throw new DOMException('Conversation stopped', 'AbortError')

    const finalText = generatedText.trim()
    if (!finalText)
      throw new Error(`${agent.name} returned an empty reply`)

    turn.text = finalText
    generationComplete = true
    queueSpeech(streamedText ? speechBuffer : finalText)
    await speechQueue
    if (speechFailure)
      throw speechFailure

    if (signal.aborted)
      throw new DOMException('Conversation stopped', 'AbortError')

    turn.status = 'complete'
    this.emitState()
  }

  private buildMessages(side: DualConversationSide): DualConversationMessage[] {
    const agent = this.agents[side]
    const otherAgent = this.agents[otherSide(side)]
    const runtimePrompt = [
      `You are ${agent.name}, one of exactly two AI characters in a spoken conversation.`,
      `The other character is ${otherAgent.name}.`,
      'Continue the conversation naturally and answer only as yourself.',
      'Keep each turn concise with two to four short sentences.',
      'Write dialogue only.',
      'Do not add speaker labels or narrate actions.',
    ].join(' ')
    const messages: DualConversationMessage[] = [{
      role: 'system',
      content: [agent.systemPrompt.trim(), runtimePrompt].filter(Boolean).join('\n\n'),
    }]

    let pendingUserText = `The first message is: ${this.state.seed}`
    for (const turn of this.state.turns.slice(0, -1)) {
      if (turn.side === side) {
        if (pendingUserText) {
          messages.push({ role: 'user', content: pendingUserText })
          pendingUserText = ''
        }
        messages.push({ role: 'assistant', content: turn.text })
      }
      else {
        const otherReply = `${turn.speaker}: ${turn.text}`
        pendingUserText = pendingUserText
          ? `${pendingUserText}\n\n${otherReply}`
          : otherReply
      }
    }

    if (pendingUserText)
      messages.push({ role: 'user', content: pendingUserText })

    return messages
  }

  private isCurrentRun(currentRunId: number) {
    return this.runId === currentRunId
  }

  private interruptStreamingTurn() {
    const activeTurn = this.state.turns.at(-1)
    if (activeTurn?.status === 'streaming')
      activeTurn.status = 'interrupted'
  }

  private updateState(patch: Partial<Omit<DualConversationSnapshot, 'turns'>>) {
    Object.assign(this.state, patch)
    this.emitState()
  }

  private emitState() {
    this.onStateChange?.(this.getSnapshot())
  }
}
