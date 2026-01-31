/**
 * Base Mode Controller
 *
 * Abstract base class for interaction mode controllers.
 */

import type { LongTermMemory } from '../memory/long-term'
import type { ShortTermMemory } from '../memory/short-term'
import type {
  AgentConfig,
  AgentState,
  ConversationTurn,
  MultiAgentEvent,
  MultiAgentMessage,
  MultiAgentSessionState,
} from '../types'

import { nanoid } from 'nanoid'

/**
 * LLM generation function signature
 * This will be provided by the integration layer (e.g., stage-ui stores)
 */
export type GenerateFn = (
  agentConfig: AgentConfig,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
) => Promise<string>

/**
 * Mode controller options
 */
export interface ModeControllerOptions {
  /** Session state */
  session: MultiAgentSessionState
  /** LLM generation function */
  generate: GenerateFn
  /** Event callback */
  onEvent?: (event: MultiAgentEvent) => void | Promise<void>
  /** Get short-term memory for an agent */
  getShortTermMemory?: (agentId: string) => ShortTermMemory | undefined
  /** Get long-term memory for an agent */
  getLongTermMemory?: (agentId: string) => LongTermMemory | undefined
}

/**
 * Abstract base class for mode controllers
 */
export abstract class BaseModeController {
  protected session: MultiAgentSessionState
  protected generate: GenerateFn
  protected eventListeners: Set<(event: MultiAgentEvent) => void | Promise<void>> = new Set()
  protected getShortTermMemory?: (agentId: string) => ShortTermMemory | undefined
  protected getLongTermMemory?: (agentId: string) => LongTermMemory | undefined
  protected isRunning: boolean = false
  protected abortController?: AbortController

  constructor(options: ModeControllerOptions) {
    this.session = options.session
    this.generate = options.generate
    this.getShortTermMemory = options.getShortTermMemory
    this.getLongTermMemory = options.getLongTermMemory

    if (options.onEvent) {
      this.eventListeners.add(options.onEvent)
    }
  }

  /**
   * Start the mode controller
   */
  abstract start(): Promise<void>

  /**
   * Stop the mode controller
   */
  stop(): void {
    this.isRunning = false
    this.abortController?.abort()
  }

  /**
   * Check if the mode is running
   */
  get running(): boolean {
    return this.isRunning
  }

  /**
   * Add event listener
   */
  onEvent(listener: (event: MultiAgentEvent) => void | Promise<void>): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /**
   * Emit an event
   */
  protected async emitEvent(event: MultiAgentEvent): Promise<void> {
    const promises: Promise<void>[] = []
    for (const listener of this.eventListeners) {
      const result = listener(event)
      if (result instanceof Promise) {
        promises.push(result)
      }
    }
    await Promise.all(promises)
  }

  /**
   * Get agent by ID
   */
  protected getAgent(agentId: string): AgentState | undefined {
    return this.session.agents.get(agentId)
  }

  /**
   * Get all agents
   */
  protected getAllAgents(): AgentState[] {
    return Array.from(this.session.agents.values())
  }

  /**
   * Create a message
   */
  protected createMessage(
    fromAgentId: string,
    content: string,
    options?: { toAgentId?: string, phase?: string },
  ): MultiAgentMessage {
    return {
      id: nanoid(),
      timestamp: Date.now(),
      fromAgentId,
      toAgentId: options?.toAgentId,
      content,
      role: 'agent',
      phase: options?.phase,
    }
  }

  /**
   * Record a turn
   */
  protected recordTurn(agentId: string, message: MultiAgentMessage): ConversationTurn {
    const turn: ConversationTurn = {
      turnNumber: this.session.turns.length + 1,
      agentId,
      message,
      timestamp: Date.now(),
    }
    this.session.turns.push(turn)
    return turn
  }

  /**
   * Build context from recent turns
   */
  protected buildTurnContext(maxTurns: number = 10): string {
    const recentTurns = this.session.turns.slice(-maxTurns)
    if (recentTurns.length === 0) {
      return ''
    }

    return recentTurns
      .map((turn) => {
        const agent = this.getAgent(turn.agentId)
        const name = agent?.config.name ?? turn.agentId
        return `${name}: ${turn.message.content}`
      })
      .join('\n\n')
  }

  /**
   * Update agent speaking state
   */
  protected setAgentSpeaking(agentId: string, speaking: boolean): void {
    const agent = this.getAgent(agentId)
    if (agent) {
      agent.isSpeaking = speaking
      agent.activity = speaking ? { type: 'speaking' } : { type: 'idle' }
      if (speaking) {
        agent.lastMessageAt = Date.now()
      }
    }
  }

  /**
   * Generate a response from an agent
   */
  protected async generateAgentResponse(
    agentId: string,
    prompt: string,
    additionalContext?: string,
  ): Promise<string> {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    this.setAgentSpeaking(agentId, true)

    try {
      const systemPrompt = this.buildSystemPrompt(agent.config, additionalContext)
      const contextMessages = this.buildContextMessages()

      const response = await this.generate(agent.config, systemPrompt, [
        ...contextMessages,
        { role: 'user', content: prompt },
      ])

      return response
    }
    finally {
      this.setAgentSpeaking(agentId, false)
    }
  }

  /**
   * Build system prompt for an agent
   */
  protected buildSystemPrompt(config: AgentConfig, additionalContext?: string): string {
    const parts = [config.systemPrompt]

    if (config.role) {
      parts.push(`\nYour assigned role in this session is: ${config.role}`)
    }

    parts.push(`\nYour name is: ${config.name}`)

    if (this.session.config.topic) {
      parts.push(`\nThe current topic is: ${this.session.config.topic}`)
    }

    if (additionalContext) {
      parts.push(`\n${additionalContext}`)
    }

    return parts.join('')
  }

  /**
   * Build context messages from recent conversation
   */
  protected buildContextMessages(): Array<{ role: 'user' | 'assistant' | 'system', content: string }> {
    const turnContext = this.buildTurnContext(10)
    if (!turnContext) {
      return []
    }

    return [
      {
        role: 'system',
        content: `Recent conversation:\n${turnContext}`,
      },
    ]
  }
}
