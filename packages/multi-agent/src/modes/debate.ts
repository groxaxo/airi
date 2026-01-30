/**
 * Debate Mode Controller
 *
 * Manages structured debates with phases, sides, and synthesis.
 */

import type {
  AgentState,
  DebateModeSettings,
  DebatePhase,
} from '../types'
import type { ModeControllerOptions } from './base'

import { BaseModeController } from './base'

const DEFAULT_PHASES: DebatePhase[] = [
  { name: 'opening', participants: [], maxTurns: 1 },
  { name: 'rebuttal', participants: [], maxTurns: 2 },
  { name: 'cross-examination', participants: [], maxTurns: 3 },
  { name: 'closing', participants: [], maxTurns: 1 },
  { name: 'synthesis', participants: [], maxTurns: 1 },
]

const DEFAULT_SETTINGS: DebateModeSettings = {
  phases: DEFAULT_PHASES,
  includeModerator: true,
  phaseDurationMs: 60000, // 1 minute per phase
  produceFinalSynthesis: true,
}

/**
 * DebateModeController orchestrates structured debates.
 */
export class DebateModeController extends BaseModeController {
  private settings: DebateModeSettings
  private currentPhaseIndex: number = 0

  constructor(options: ModeControllerOptions) {
    super(options)
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(options.session.config.modeSettings as DebateModeSettings),
    }

    // Auto-assign participants if not specified
    this.assignParticipantsToPhases()
  }

  /**
   * Start the debate
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
      await this.runDebate()
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
   * Get current phase
   */
  getCurrentPhase(): DebatePhase | undefined {
    return this.settings.phases[this.currentPhaseIndex]
  }

  private async runDebate(): Promise<void> {
    const topic = this.session.config.topic ?? 'the topic at hand'

    // Moderator introduction (if present)
    const moderator = this.getModerator()
    if (moderator) {
      await this.moderatorIntroduction(moderator, topic)
    }

    // Run each phase
    for (let i = 0; i < this.settings.phases.length; i++) {
      if (!this.isRunning) {
        break
      }

      this.currentPhaseIndex = i
      const phase = this.settings.phases[i]
      this.session.currentPhase = phase.name

      await this.emitEvent({ type: 'phase:changed', phase: phase.name })

      await this.runPhase(phase, topic)

      // Moderator transition (if present and not last phase)
      if (moderator && i < this.settings.phases.length - 1) {
        await this.moderatorTransition(moderator, phase.name, this.settings.phases[i + 1].name)
      }
    }

    // Final synthesis
    if (this.settings.produceFinalSynthesis) {
      await this.generateFinalSynthesis(topic)
    }

    await this.emitEvent({
      type: 'session:ended',
      sessionId: this.session.config.id,
      synthesis: this.session.finalSynthesis,
    })
  }

  private async runPhase(phase: DebatePhase, topic: string): Promise<void> {
    const participants = this.getPhaseParticipants(phase)
    const maxTurns = phase.maxTurns ?? 2

    for (let turn = 0; turn < maxTurns; turn++) {
      for (const agent of participants) {
        if (!this.isRunning) {
          return
        }

        const turnNumber = this.session.turns.length + 1
        await this.emitEvent({
          type: 'turn:started',
          turnNumber,
          agentId: agent.config.id,
        })

        const prompt = this.buildPhasePrompt(phase.name, topic, agent)
        const response = await this.generateAgentResponse(
          agent.config.id,
          prompt,
          this.getPhaseContext(phase.name, agent),
        )

        const message = this.createMessage(agent.config.id, response, { phase: phase.name })
        this.recordTurn(agent.config.id, message)

        // Update short-term memory
        const shortTerm = this.getShortTermMemory?.(agent.config.id)
        if (shortTerm) {
          shortTerm.addEntry({
            type: 'message',
            content: response,
            agentId: agent.config.id,
            metadata: { phase: phase.name },
          })
        }

        await this.emitEvent({ type: 'message:sent', message })
        await this.emitEvent({
          type: 'turn:ended',
          turnNumber,
          agentId: agent.config.id,
        })

        await this.delay(500)
      }
    }
  }

  private buildPhasePrompt(
    phaseName: DebatePhase['name'],
    topic: string,
    agent: AgentState,
  ): string {
    const role = agent.config.role
    const side = role === 'pro' ? 'supporting' : role === 'con' ? 'opposing' : 'neutral'

    switch (phaseName) {
      case 'opening':
        return `This is the opening statement phase of the debate about "${topic}". `
          + `You are ${side} the proposition. `
          + `Present your initial position clearly and persuasively. `
          + `Include your main arguments and why your position is valid. `
          + `Keep your statement focused (4-6 sentences).`

      case 'rebuttal':
        return `This is the rebuttal phase of the debate about "${topic}". `
          + `You are ${side} the proposition. `
          + `Address the opposing arguments that have been made. `
          + `Point out weaknesses in their reasoning and defend your position. `
          + `Be respectful but firm (3-5 sentences).`

      case 'cross-examination':
        return `This is the cross-examination phase of the debate about "${topic}". `
          + `You are ${side} the proposition. `
          + `Ask pointed questions to the other side or respond to questions asked of you. `
          + `Try to expose weaknesses in opposing arguments or clarify your position. `
          + `Keep exchanges brief and focused (2-4 sentences).`

      case 'closing':
        return `This is the closing statement phase of the debate about "${topic}". `
          + `You are ${side} the proposition. `
          + `Summarize your key arguments and why they should prevail. `
          + `Address the strongest opposing points and explain why your position is stronger. `
          + `Make a final persuasive appeal (4-6 sentences).`

      case 'synthesis':
        return `This is the synthesis phase. Based on the entire debate about "${topic}", `
          + `provide an objective analysis of both sides' arguments. `
          + `Identify areas of agreement and key points of disagreement. `
          + `Propose a synthesized solution or conclusion that incorporates valid points from both sides. `
          + `Be fair and balanced (5-7 sentences).`

      default:
        return `Continue the debate about "${topic}" in your assigned role.`
    }
  }

  // NOTICE: agent parameter reserved for future role-based context customization
  private getPhaseContext(phaseName: DebatePhase['name'], _agent: AgentState): string {
    const contexts: Record<DebatePhase['name'], string> = {
      'opening': 'This is your opening statement. Make a strong first impression.',
      'rebuttal': 'Counter the opposing arguments while reinforcing your position.',
      'cross-examination': 'Focus on questioning and challenging the other side.',
      'closing': 'This is your final chance to persuade. Make it count.',
      'synthesis': 'Be objective and fair in your analysis.',
    }

    return contexts[phaseName] ?? ''
  }

  private async moderatorIntroduction(moderator: AgentState, topic: string): Promise<void> {
    const prompt = `You are the moderator for a debate about "${topic}". `
      + `Introduce the debate topic, explain the format (opening statements, rebuttals, `
      + `cross-examination, closing statements, and synthesis), and set expectations for civil discourse. `
      + `Keep your introduction brief but engaging (4-5 sentences).`

    const response = await this.generateAgentResponse(moderator.config.id, prompt)
    const message = this.createMessage(moderator.config.id, response, { phase: 'introduction' })
    this.recordTurn(moderator.config.id, message)

    await this.emitEvent({ type: 'message:sent', message })
    await this.delay(300)
  }

  private async moderatorTransition(
    moderator: AgentState,
    fromPhase: string,
    toPhase: string,
  ): Promise<void> {
    const prompt = `As the moderator, briefly summarize the ${fromPhase} phase and `
      + `introduce the ${toPhase} phase. Keep it concise (2-3 sentences).`

    const response = await this.generateAgentResponse(moderator.config.id, prompt)
    const message = this.createMessage(moderator.config.id, response, { phase: 'transition' })
    this.recordTurn(moderator.config.id, message)

    await this.emitEvent({ type: 'message:sent', message })
    await this.delay(300)
  }

  private async generateFinalSynthesis(topic: string): Promise<void> {
    // Prefer synthesizer role, then moderator, then any agent
    const agents = this.getAllAgents()
    const synthesizer = agents.find(a => a.config.role === 'synthesizer')
      ?? agents.find(a => a.config.role === 'moderator')
      ?? agents[0]

    if (!synthesizer) {
      return
    }

    const prompt = `Based on the entire debate about "${topic}", provide a final synthesis. `
      + `Identify the strongest arguments from each side, areas of agreement, `
      + `and propose a balanced conclusion or solution. `
      + `This should be a concrete, actionable synthesis (6-8 sentences).`

    const response = await this.generateAgentResponse(synthesizer.config.id, prompt)
    this.session.finalSynthesis = response

    const message = this.createMessage(synthesizer.config.id, response, { phase: 'final-synthesis' })
    this.recordTurn(synthesizer.config.id, message)

    await this.emitEvent({ type: 'message:sent', message })
  }

  private getModerator(): AgentState | undefined {
    if (!this.settings.includeModerator) {
      return undefined
    }
    return this.getAllAgents().find(a => a.config.role === 'moderator')
  }

  private getPhaseParticipants(phase: DebatePhase): AgentState[] {
    if (phase.participants.length > 0) {
      return phase.participants
        .map(id => this.getAgent(id))
        .filter((a): a is AgentState => a !== undefined)
    }

    // Default: all non-moderator agents for most phases
    const agents = this.getAllAgents()

    if (phase.name === 'synthesis') {
      // Only synthesizer or moderator for synthesis phase
      const synthesizer = agents.find(a =>
        a.config.role === 'synthesizer' || a.config.role === 'moderator',
      )
      return synthesizer ? [synthesizer] : [agents[0]].filter(Boolean)
    }

    // Exclude moderator from debate phases
    return agents.filter(a => a.config.role !== 'moderator')
  }

  private assignParticipantsToPhases(): void {
    const agents = this.getAllAgents()
    const debaters = agents.filter(a => a.config.role !== 'moderator')
    const debaterIds = debaters.map(a => a.config.id)

    for (const phase of this.settings.phases) {
      if (phase.participants.length === 0) {
        if (phase.name === 'synthesis') {
          const synthesizer = agents.find(a =>
            a.config.role === 'synthesizer' || a.config.role === 'moderator',
          )
          phase.participants = synthesizer ? [synthesizer.config.id] : [debaterIds[0]].filter(Boolean)
        }
        else {
          phase.participants = debaterIds
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
