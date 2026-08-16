/**
 * Multi-Agent Manager
 *
 * Core orchestration component for managing multiple AI agents.
 */

import type {
  AgentConfig,
  AgentState,
  ConversationTurn,
  MultiAgentEvent,
  MultiAgentMessage,
  MultiAgentSessionConfig,
  MultiAgentSessionState,
  Vector3,
} from '../types'

import { nanoid } from 'nanoid'

import { LongTermMemory } from '../memory/long-term'
import { ShortTermMemory } from '../memory/short-term'
import { AgentInstance } from './agent-instance'

export interface MultiAgentManagerOptions {
  /** Event callback */
  onEvent?: (event: MultiAgentEvent) => void | Promise<void>
  /** Default model provider */
  defaultProvider?: string
  /** Default model */
  defaultModel?: string
}

/**
 * MultiAgentManager orchestrates multiple AI agents in various interaction modes.
 */
export class MultiAgentManager {
  private sessions: Map<string, MultiAgentSessionState> = new Map()
  private agentInstances: Map<string, AgentInstance> = new Map()
  private shortTermMemories: Map<string, ShortTermMemory> = new Map()
  private longTermMemories: Map<string, LongTermMemory> = new Map()
  private eventListeners: Set<(event: MultiAgentEvent) => void | Promise<void>> = new Set()
  private options: MultiAgentManagerOptions

  constructor(options: MultiAgentManagerOptions = {}) {
    this.options = options
    if (options.onEvent) {
      this.eventListeners.add(options.onEvent)
    }
  }

  /**
   * Create a new multi-agent session
   */
  async createSession(config: Omit<MultiAgentSessionConfig, 'id'>): Promise<string> {
    const sessionId = nanoid()
    const sessionConfig: MultiAgentSessionConfig = { id: sessionId, ...config }

    // Initialize agent states
    const agents = new Map<string, AgentState>()
    for (const agentConfig of sessionConfig.agents) {
      const state = this.createAgentState(agentConfig)
      agents.set(agentConfig.id, state)

      // Create agent instance
      const instance = new AgentInstance(agentConfig, {
        defaultProvider: this.options.defaultProvider,
        defaultModel: this.options.defaultModel,
      })
      this.agentInstances.set(`${sessionId}:${agentConfig.id}`, instance)

      // Initialize memories
      const shortTerm = new ShortTermMemory(agentConfig.memory.shortTermCapacity)
      this.shortTermMemories.set(`${sessionId}:${agentConfig.id}`, shortTerm)

      if (agentConfig.memory.enableLongTerm) {
        const longTerm = new LongTermMemory(agentConfig.id)
        this.longTermMemories.set(`${sessionId}:${agentConfig.id}`, longTerm)
      }
    }

    const sessionState: MultiAgentSessionState = {
      config: sessionConfig,
      agents,
      turns: [],
      isActive: false,
      startedAt: Date.now(),
    }

    this.sessions.set(sessionId, sessionState)
    return sessionId
  }

  /**
   * Start a session
   */
  async startSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    session.isActive = true
    session.startedAt = Date.now()

    await this.emitEvent({ type: 'session:started', sessionId })
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, synthesis?: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    session.isActive = false
    session.endedAt = Date.now()
    session.finalSynthesis = synthesis

    await this.emitEvent({ type: 'session:ended', sessionId, synthesis })
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): MultiAgentSessionState | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): MultiAgentSessionState[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive)
  }

  /**
   * Execute a single turn for an agent
   */
  async executeTurn(
    sessionId: string,
    agentId: string,
    prompt: string,
    options?: { targetAgentId?: string, phase?: string },
  ): Promise<MultiAgentMessage> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const agentState = session.agents.get(agentId)
    if (!agentState) {
      throw new Error(`Agent ${agentId} not found in session ${sessionId}`)
    }

    const instance = this.agentInstances.get(`${sessionId}:${agentId}`)
    if (!instance) {
      throw new Error(`Agent instance ${agentId} not found`)
    }

    const turnNumber = session.turns.length + 1
    await this.emitEvent({ type: 'turn:started', turnNumber, agentId })

    // Update agent state
    agentState.isSpeaking = true
    agentState.activity = { type: 'thinking' }

    // Build context from short-term memory
    const shortTerm = this.shortTermMemories.get(`${sessionId}:${agentId}`)
    const context = shortTerm?.getRecentEntries(10) ?? []

    // Generate response
    const response = await instance.generate(prompt, context)

    // Create message
    const message: MultiAgentMessage = {
      id: nanoid(),
      timestamp: Date.now(),
      fromAgentId: agentId,
      toAgentId: options?.targetAgentId,
      content: response,
      role: 'agent',
      phase: options?.phase,
    }

    // Record turn
    const turn: ConversationTurn = {
      turnNumber,
      agentId,
      message,
      timestamp: Date.now(),
    }
    session.turns.push(turn)

    // Update memory
    shortTerm?.addEntry({
      type: 'message',
      content: response,
      agentId,
    })

    // Update agent state
    agentState.isSpeaking = false
    agentState.lastMessageAt = Date.now()
    agentState.activity = { type: 'idle' }

    await this.emitEvent({ type: 'message:sent', message })
    await this.emitEvent({ type: 'turn:ended', turnNumber, agentId })

    return message
  }

  /**
   * Move an agent to a new position (for freedom mode)
   */
  async moveAgent(sessionId: string, agentId: string, destination: Vector3): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const agentState = session.agents.get(agentId)
    if (!agentState) {
      throw new Error(`Agent ${agentId} not found in session ${sessionId}`)
    }

    const from = { ...agentState.position }
    agentState.activity = { type: 'walking', destination }
    agentState.position = destination

    await this.emitEvent({ type: 'agent:moved', agentId, from, to: destination })
  }

  /**
   * Update agent activity
   */
  async updateAgentActivity(sessionId: string, agentId: string, activity: AgentState['activity']): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const agentState = session.agents.get(agentId)
    if (!agentState) {
      throw new Error(`Agent ${agentId} not found in session ${sessionId}`)
    }

    agentState.activity = activity

    await this.emitEvent({ type: 'agent:activity', agentId, activity })
  }

  /**
   * Add event listener
   */
  onEvent(listener: (event: MultiAgentEvent) => void | Promise<void>): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /**
   * Get short-term memory for an agent
   */
  getShortTermMemory(sessionId: string, agentId: string): ShortTermMemory | undefined {
    return this.shortTermMemories.get(`${sessionId}:${agentId}`)
  }

  /**
   * Get long-term memory for an agent
   */
  getLongTermMemory(sessionId: string, agentId: string): LongTermMemory | undefined {
    return this.longTermMemories.get(`${sessionId}:${agentId}`)
  }

  /**
   * Cleanup session resources
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }

    // Cleanup agent instances and memories
    for (const [agentId] of session.agents) {
      const key = `${sessionId}:${agentId}`
      this.agentInstances.delete(key)
      this.shortTermMemories.delete(key)
      this.longTermMemories.delete(key)
    }

    this.sessions.delete(sessionId)
  }

  private createAgentState(config: AgentConfig): AgentState {
    return {
      config,
      position: config.avatar?.initialPosition ?? { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      activity: { type: 'idle' },
      goals: [],
      isSpeaking: false,
    }
  }

  private async emitEvent(event: MultiAgentEvent): Promise<void> {
    const promises: Promise<void>[] = []
    for (const listener of this.eventListeners) {
      const result = listener(event)
      if (result instanceof Promise) {
        promises.push(result)
      }
    }
    await Promise.all(promises)
  }
}
