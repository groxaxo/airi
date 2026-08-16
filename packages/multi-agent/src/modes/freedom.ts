/**
 * Freedom Mode Controller
 *
 * Manages autonomous agent behavior with roaming and independent goals.
 */

import type {
  AgentGoal,
  AgentState,
  FreedomModeSettings,
  Vector3,
} from '../types'
import type { ModeControllerOptions } from './base'

import { nanoid } from 'nanoid'

import { BaseModeController } from './base'

const DEFAULT_SETTINGS: FreedomModeSettings = {
  loopIntervalMs: 2000,
  enableInterAgentChat: true,
  worldBounds: {
    min: { x: -10, y: 0, z: -10 },
    max: { x: 10, y: 5, z: 10 },
  },
}

/**
 * FreedomModeController manages autonomous agent behavior.
 */
export class FreedomModeController extends BaseModeController {
  private settings: FreedomModeSettings
  private loopTimer?: ReturnType<typeof setTimeout>

  constructor(options: ModeControllerOptions) {
    super(options)
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(options.session.config.modeSettings as FreedomModeSettings),
    }

    // Initialize agent goals from config or defaults
    this.initializeGoals()
  }

  /**
   * Start freedom mode
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

    // Start the autonomous loop for each agent
    this.startLoops()
  }

  /**
   * Stop freedom mode
   */
  stop(): void {
    super.stop()
    this.stopLoops()
  }

  /**
   * Add a goal to an agent's queue
   */
  addGoal(agentId: string, goal: Omit<AgentGoal, 'id'>): void {
    const agent = this.getAgent(agentId)
    if (!agent) {
      return
    }

    const fullGoal: AgentGoal = {
      id: nanoid(),
      ...goal,
    }

    // Insert based on priority
    const insertIndex = agent.goals.findIndex(g => g.priority < fullGoal.priority)
    if (insertIndex >= 0) {
      agent.goals.splice(insertIndex, 0, fullGoal)
    }
    else {
      agent.goals.push(fullGoal)
    }
  }

  /**
   * Remove a goal from an agent's queue
   */
  removeGoal(agentId: string, goalId: string): boolean {
    const agent = this.getAgent(agentId)
    if (!agent) {
      return false
    }

    const index = agent.goals.findIndex(g => g.id === goalId)
    if (index >= 0) {
      agent.goals.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Trigger an interaction between two agents
   */
  async triggerInteraction(fromAgentId: string, toAgentId: string, topic?: string): Promise<void> {
    if (!this.settings.enableInterAgentChat) {
      return
    }

    const fromAgent = this.getAgent(fromAgentId)
    const toAgent = this.getAgent(toAgentId)

    if (!fromAgent || !toAgent) {
      return
    }

    // Generate interaction prompt
    const prompt = topic
      ? `You notice ${toAgent.config.name} nearby. Start a brief conversation about: ${topic}`
      : `You notice ${toAgent.config.name} nearby. Start a brief casual conversation.`

    const response = await this.generateAgentResponse(fromAgentId, prompt)

    const message = this.createMessage(fromAgentId, response, { toAgentId })
    this.recordTurn(fromAgentId, message)

    await this.emitEvent({ type: 'message:sent', message })

    // Let the other agent respond
    if (this.isRunning) {
      await this.delay(500)

      const responsePrompt = `${fromAgent.config.name} says to you: "${response}". Respond briefly.`
      const replyContent = await this.generateAgentResponse(toAgentId, responsePrompt)

      const replyMessage = this.createMessage(toAgentId, replyContent, { toAgentId: fromAgentId })
      this.recordTurn(toAgentId, replyMessage)

      await this.emitEvent({ type: 'message:sent', message: replyMessage })
    }
  }

  private startLoops(): void {
    const tick = async () => {
      if (!this.isRunning) {
        return
      }

      const agents = this.getAllAgents()

      // Process each agent's autonomous loop
      for (const agent of agents) {
        if (!this.isRunning) {
          break
        }

        try {
          await this.processAgentTick(agent)
        }
        catch (error) {
          console.error(`Error in agent ${agent.config.id} tick:`, error)
        }
      }

      // Schedule next tick
      if (this.isRunning) {
        this.loopTimer = setTimeout(tick, this.settings.loopIntervalMs)
      }
    }

    // Start the first tick
    void tick()
  }

  private stopLoops(): void {
    if (this.loopTimer) {
      clearTimeout(this.loopTimer)
      this.loopTimer = undefined
    }
  }

  private async processAgentTick(agent: AgentState): Promise<void> {
    // Get current goal
    const currentGoal = agent.goals[0]

    if (!currentGoal) {
      // No goals - decide what to do
      await this.decideNextAction(agent)
      return
    }

    // Process based on goal type
    switch (currentGoal.type) {
      case 'explore':
        await this.processExploreGoal(agent, currentGoal)
        break
      case 'interact':
        await this.processInteractGoal(agent, currentGoal)
        break
      case 'task':
        await this.processTaskGoal(agent, currentGoal)
        break
      case 'idle':
        await this.processIdleGoal(agent, currentGoal)
        break
    }
  }

  private async decideNextAction(agent: AgentState): Promise<void> {
    // Use LLM to decide what to do next
    const prompt = `You are currently idle at position (${agent.position.x.toFixed(1)}, ${agent.position.y.toFixed(1)}, ${agent.position.z.toFixed(1)}). `
      + `What would you like to do next? Options: explore the area, interact with someone nearby, or stay idle and observe. `
      + `Respond with one of: EXPLORE, INTERACT, or IDLE, followed by a brief reason.`

    const response = await this.generateAgentResponse(agent.config.id, prompt)
    const action = this.parseActionResponse(response)

    // Add appropriate goal
    switch (action) {
      case 'EXPLORE':
        this.addGoal(agent.config.id, {
          description: 'Explore the surrounding area',
          priority: 1,
          type: 'explore',
          target: this.generateRandomPosition(),
        })
        break

      case 'INTERACT': {
        const otherAgents = this.getAllAgents().filter(a => a.config.id !== agent.config.id)
        if (otherAgents.length > 0) {
          const target = otherAgents[Math.floor(Math.random() * otherAgents.length)]
          this.addGoal(agent.config.id, {
            description: `Interact with ${target.config.name}`,
            priority: 2,
            type: 'interact',
            target: target.config.id,
          })
        }
        break
      }

      case 'IDLE':
      default:
        this.addGoal(agent.config.id, {
          description: 'Stay idle and observe',
          priority: 0,
          type: 'idle',
        })
        break
    }
  }

  private async processExploreGoal(agent: AgentState, goal: AgentGoal): Promise<void> {
    const targetPos = goal.target as Vector3 | undefined

    if (!targetPos) {
      // Generate a random destination
      const destination = this.generateRandomPosition()
      goal.target = destination
    }

    const destination = goal.target as Vector3

    // Move towards destination
    const newPosition = this.moveTowards(agent.position, destination, agent.config.avatar?.movementSpeed ?? 1)

    await this.updateAgentPosition(agent, newPosition)

    // Check if reached destination
    if (this.isNearPosition(newPosition, destination, 0.5)) {
      // Goal complete - remove it
      agent.goals.shift()

      // Record observation
      const shortTerm = this.getShortTermMemory?.(agent.config.id)
      if (shortTerm) {
        shortTerm.addEntry({
          type: 'observation',
          content: `Reached destination at (${destination.x.toFixed(1)}, ${destination.y.toFixed(1)}, ${destination.z.toFixed(1)})`,
          agentId: agent.config.id,
        })
      }
    }
  }

  private async processInteractGoal(agent: AgentState, goal: AgentGoal): Promise<void> {
    const targetAgentId = goal.target as string | undefined

    if (!targetAgentId) {
      agent.goals.shift()
      return
    }

    const targetAgent = this.getAgent(targetAgentId)
    if (!targetAgent) {
      agent.goals.shift()
      return
    }

    // Check if close enough to interact
    if (this.isNearPosition(agent.position, targetAgent.position, 2)) {
      // Trigger interaction
      await this.triggerInteraction(agent.config.id, targetAgentId)

      // Goal complete
      agent.goals.shift()
    }
    else {
      // Move towards target
      const newPosition = this.moveTowards(
        agent.position,
        targetAgent.position,
        agent.config.avatar?.movementSpeed ?? 1,
      )
      await this.updateAgentPosition(agent, newPosition)
    }
  }

  private async processTaskGoal(agent: AgentState, goal: AgentGoal): Promise<void> {
    // Use LLM to process the task
    const prompt = `You have a task: "${goal.description}". `
      + `You are at position (${agent.position.x.toFixed(1)}, ${agent.position.y.toFixed(1)}, ${agent.position.z.toFixed(1)}). `
      + `What is your next step to complete this task? Respond briefly.`

    const response = await this.generateAgentResponse(agent.config.id, prompt)

    // Record the action
    const shortTerm = this.getShortTermMemory?.(agent.config.id)
    if (shortTerm) {
      shortTerm.addEntry({
        type: 'action',
        content: `Working on task "${goal.description}": ${response}`,
        agentId: agent.config.id,
      })
    }

    // For now, complete the task after one iteration
    // In a real implementation, this would track progress
    agent.goals.shift()
  }

  // NOTICE: goal parameter reserved for future idle behavior customization
  private async processIdleGoal(agent: AgentState, _goal: AgentGoal): Promise<void> {
    agent.activity = { type: 'idle' }

    // Occasionally make an observation
    if (Math.random() < 0.2) {
      const prompt = `You are standing idle and observing your surroundings. `
        + `What do you notice or think about? Respond with a brief observation or thought.`

      const response = await this.generateAgentResponse(agent.config.id, prompt)

      const shortTerm = this.getShortTermMemory?.(agent.config.id)
      if (shortTerm) {
        shortTerm.addEntry({
          type: 'thought',
          content: response,
          agentId: agent.config.id,
        })
      }
    }

    // Complete idle goal after one iteration
    agent.goals.shift()
  }

  private async updateAgentPosition(agent: AgentState, newPosition: Vector3): Promise<void> {
    const from = { ...agent.position }
    agent.position = newPosition
    agent.activity = { type: 'walking', destination: newPosition }

    await this.emitEvent({
      type: 'agent:moved',
      agentId: agent.config.id,
      from,
      to: newPosition,
    })
  }

  private initializeGoals(): void {
    if (!this.settings.agentGoals) {
      return
    }

    for (const [agentId, goals] of Object.entries(this.settings.agentGoals)) {
      const agent = this.getAgent(agentId)
      if (agent) {
        agent.goals = goals.map(g => ({ ...g, id: g.id || nanoid() }))
      }
    }
  }

  private generateRandomPosition(): Vector3 {
    const bounds = this.settings.worldBounds ?? DEFAULT_SETTINGS.worldBounds!
    return {
      x: bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x),
      y: bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y),
      z: bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z),
    }
  }

  private moveTowards(from: Vector3, to: Vector3, speed: number): Vector3 {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (distance <= speed) {
      return { ...to }
    }

    const ratio = speed / distance
    return {
      x: from.x + dx * ratio,
      y: from.y + dy * ratio,
      z: from.z + dz * ratio,
    }
  }

  private isNearPosition(a: Vector3, b: Vector3, threshold: number): boolean {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const dz = a.z - b.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= threshold
  }

  private parseActionResponse(response: string): string {
    const upper = response.toUpperCase()
    if (upper.includes('EXPLORE')) {
      return 'EXPLORE'
    }
    if (upper.includes('INTERACT')) {
      return 'INTERACT'
    }
    return 'IDLE'
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
