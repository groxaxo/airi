/**
 * Conversation Mode Controller
 *
 * Manages collaborative topic discussions between agents.
 */

import type {
  ConversationModeSettings,
  MultiAgentMessage,
} from '../types'
import type { ModeControllerOptions } from './base'

import { BaseModeController } from './base'

const DEFAULT_SETTINGS: ConversationModeSettings = {
  turnOrder: 'round-robin',
  enableQuestions: true,
  targetConsensus: true,
}

/**
 * ConversationModeController orchestrates collaborative discussions.
 */
export class ConversationModeController extends BaseModeController {
  private settings: ConversationModeSettings
  private currentAgentIndex: number = 0

  constructor(options: ModeControllerOptions) {
    super(options)
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(options.session.config.modeSettings as ConversationModeSettings),
    }
  }

  /**
   * Start the conversation mode
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    this.abortController = new AbortController()
    this.session.isActive = true

    await this.emitEvent({
      type: 'session:started',
      sessionId: this.session.config.id,
    })

    try {
      await this.runConversationLoop()
    }
    catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        await this.emitEvent({
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    }
    finally {
      this.isRunning = false
      this.session.isActive = false
    }
  }

  /**
   * Inject a user message into the conversation
   */
  async injectUserMessage(content: string): Promise<void> {
    const message: MultiAgentMessage = {
      id: `user-${Date.now()}`,
      timestamp: Date.now(),
      fromAgentId: 'user',
      content,
      role: 'user',
    }

    this.recordTurn('user', message)
    await this.emitEvent({ type: 'message:sent', message })
  }

  private async runConversationLoop(): Promise<void> {
    const agents = this.getAllAgents()
    const maxTurns = this.session.config.constraints?.maxTurns ?? 100
    const topic = this.session.config.topic ?? 'general discussion'

    // Opening: Each agent introduces themselves
    await this.runOpeningRound(topic)

    // Main conversation loop
    while (this.isRunning && this.session.turns.length < maxTurns) {
      const agent = this.getNextAgent(agents)
      if (!agent) {
        break
      }

      const turnNumber = this.session.turns.length + 1
      await this.emitEvent({
        type: 'turn:started',
        turnNumber,
        agentId: agent.config.id,
      })

      const prompt = this.buildTurnPrompt(agent.config.id, topic)
      const response = await this.generateAgentResponse(agent.config.id, prompt)

      const message = this.createMessage(agent.config.id, response)
      this.recordTurn(agent.config.id, message)

      // Update short-term memory
      const shortTerm = this.getShortTermMemory?.(agent.config.id)
      if (shortTerm) {
        shortTerm.addEntry({
          type: 'message',
          content: response,
          agentId: agent.config.id,
        })
      }

      await this.emitEvent({ type: 'message:sent', message })
      await this.emitEvent({
        type: 'turn:ended',
        turnNumber,
        agentId: agent.config.id,
      })

      // Check for consensus or conclusion
      if (this.settings.targetConsensus && this.checkForConsensus(response)) {
        break
      }

      // Small delay between turns
      await this.delay(500)
    }

    // Generate final summary if consensus was targeted
    if (this.settings.targetConsensus) {
      await this.generateConclusion(topic)
    }

    await this.emitEvent({
      type: 'session:ended',
      sessionId: this.session.config.id,
      synthesis: this.session.finalSynthesis,
    })
  }

  private async runOpeningRound(topic: string): Promise<void> {
    const agents = this.getAllAgents()

    for (const agent of agents) {
      if (!this.isRunning) {
        break
      }

      const prompt = `You are joining a collaborative discussion about: "${topic}". `
        + `Briefly introduce yourself and share your initial thoughts on this topic. `
        + `Keep your introduction concise (2-3 sentences).`

      const response = await this.generateAgentResponse(agent.config.id, prompt)
      const message = this.createMessage(agent.config.id, response)
      this.recordTurn(agent.config.id, message)

      await this.emitEvent({ type: 'message:sent', message })
      await this.delay(300)
    }
  }

  private getNextAgent(agents: ReturnType<typeof this.getAllAgents>): ReturnType<typeof this.getAgent> {
    switch (this.settings.turnOrder) {
      case 'round-robin': {
        const agent = agents[this.currentAgentIndex]
        this.currentAgentIndex = (this.currentAgentIndex + 1) % agents.length
        return agent
      }

      case 'natural': {
        // Pick based on who hasn't spoken recently
        const sortedByActivity = [...agents].sort((a, b) => {
          const aTime = a.lastMessageAt ?? 0
          const bTime = b.lastMessageAt ?? 0
          return aTime - bTime
        })
        return sortedByActivity[0]
      }

      case 'moderator-controlled': {
        // If there's a moderator, let them decide
        const moderator = agents.find(a => a.config.role === 'moderator')
        if (moderator) {
          // For now, fall back to round-robin
          return this.getNextAgent([...agents].filter(a => a.config.id !== moderator.config.id))
        }
        return agents[this.currentAgentIndex]
      }

      default:
        return agents[this.currentAgentIndex]
    }
  }

  private buildTurnPrompt(agentId: string, topic: string): string {
    const otherAgents = this.getAllAgents().filter(a => a.config.id !== agentId)
    const otherNames = otherAgents.map(a => a.config.name).join(', ')

    let prompt = `Continue the discussion about "${topic}". `

    if (this.settings.enableQuestions) {
      prompt += `You may ask questions to ${otherNames} or respond to previous points. `
    }

    if (this.settings.targetConsensus) {
      prompt += `Work towards finding common ground and building consensus. `
    }

    prompt += `Keep your response focused and constructive (3-5 sentences).`

    return prompt
  }

  private checkForConsensus(response: string): boolean {
    const consensusIndicators = [
      'we all agree',
      'consensus reached',
      'we have reached agreement',
      'i think we all',
      'we can conclude',
      'final conclusion',
    ]

    const lowerResponse = response.toLowerCase()
    return consensusIndicators.some(indicator => lowerResponse.includes(indicator))
  }

  private async generateConclusion(topic: string): Promise<void> {
    const agents = this.getAllAgents()
    const synthesizer = agents.find(a => a.config.role === 'synthesizer')
      ?? agents.find(a => a.config.role === 'moderator')
      ?? agents[0]

    if (!synthesizer) {
      return
    }

    const prompt = `Based on the discussion about "${topic}", please provide a brief summary `
      + `of the key points and any conclusions or agreements reached. `
      + `Format this as a final synthesis of the conversation.`

    const response = await this.generateAgentResponse(synthesizer.config.id, prompt)
    this.session.finalSynthesis = response

    const message = this.createMessage(synthesizer.config.id, response, { phase: 'conclusion' })
    this.recordTurn(synthesizer.config.id, message)
    await this.emitEvent({ type: 'message:sent', message })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
