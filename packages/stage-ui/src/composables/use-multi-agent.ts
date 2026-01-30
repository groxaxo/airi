/**
 * Multi-Agent Integration Composable
 *
 * Vue composable for integrating the multi-agent system with stage-ui.
 * Connects agents to the existing provider system and 3D scene.
 */

import type {
  AgentState,
  GenerateFn,
  MultiAgentEvent,
  MultiAgentSessionConfig,
  MultiAgentSessionState,
  Vector3,
} from '@proj-airi/multi-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import {
  ConversationModeController,
  DebateModeController,
  FreedomModeController,
  ShortTermMemory,
  WorldManager,
} from '@proj-airi/multi-agent'
import { streamText } from '@xsai/stream-text'
import { nanoid } from 'nanoid'
import { computed, ref, shallowRef } from 'vue'

import { useProvidersStore } from '../stores/providers'

export interface UseMultiAgentOptions {
  /** Event callback for real-time updates */
  onEvent?: (event: MultiAgentEvent) => void | Promise<void>
  /** Default provider ID to use for agents */
  defaultProvider?: string
  /** Default model to use for agents */
  defaultModel?: string
}

export interface MultiAgentSession {
  id: string
  config: MultiAgentSessionConfig
  state: MultiAgentSessionState
  controller: ConversationModeController | DebateModeController | FreedomModeController | null
}

/**
 * Vue composable for managing multi-agent sessions
 */
export function useMultiAgent(options: UseMultiAgentOptions = {}) {
  const providersStore = useProvidersStore()

  // State
  const sessions = ref<Map<string, MultiAgentSession>>(new Map())
  const activeSessionId = ref<string | null>(null)
  const isRunning = ref(false)
  const currentPhase = ref<string | null>(null)
  const lastEvent = shallowRef<MultiAgentEvent | null>(null)

  // World manager for 3D positioning
  const worldManager = shallowRef(new WorldManager())

  // Short-term memories per agent (use shallowRef to preserve class instance types)
  const agentMemories = shallowRef<Map<string, ShortTermMemory>>(new Map())

  // Computed
  const activeSession = computed(() => {
    if (!activeSessionId.value)
      return null
    return sessions.value.get(activeSessionId.value) ?? null
  })

  const activeAgents = computed(() => {
    if (!activeSession.value)
      return []
    return Array.from(activeSession.value.state.agents.values())
  })

  const conversationHistory = computed(() => {
    if (!activeSession.value)
      return []
    return activeSession.value.state.turns
  })

  const finalSynthesis = computed(() => {
    return activeSession.value?.state.finalSynthesis ?? null
  })

  /**
   * Create a generate function that uses the configured providers
   */
  function createGenerateFn(): GenerateFn {
    return async (agentConfig, systemPrompt, messages) => {
      const providerId = agentConfig.model.provider || options.defaultProvider
      if (!providerId) {
        throw new Error(`No provider configured for agent ${agentConfig.id}`)
      }

      const provider = await providersStore.getProviderInstance(providerId) as ChatProvider
      if (!provider) {
        throw new Error(`Provider ${providerId} not found`)
      }

      const modelId = agentConfig.model.model || options.defaultModel
      if (!modelId) {
        throw new Error(`No model configured for agent ${agentConfig.id}`)
      }

      // Collect response text
      let fullText = ''

      await streamText({
        ...provider.chat(modelId),
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        onEvent: (event) => {
          if (event.type === 'text-delta') {
            fullText += event.text
          }
        },
      })

      return fullText
    }
  }

  /**
   * Create a new multi-agent session
   */
  function createSession(config: Omit<MultiAgentSessionConfig, 'id'>): string {
    const sessionId = nanoid()
    const fullConfig: MultiAgentSessionConfig = { id: sessionId, ...config }

    // Initialize agent states
    const agentStates = new Map<string, AgentState>()
    for (const agentConfig of fullConfig.agents) {
      const state: AgentState = {
        config: agentConfig,
        position: agentConfig.avatar?.initialPosition ?? { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        activity: { type: 'idle' },
        goals: [],
        isSpeaking: false,
      }
      agentStates.set(agentConfig.id, state)

      // Create short-term memory
      agentMemories.value.set(
        `${sessionId}:${agentConfig.id}`,
        new ShortTermMemory(agentConfig.memory.shortTermCapacity),
      )
    }

    const sessionState: MultiAgentSessionState = {
      config: fullConfig,
      agents: agentStates,
      turns: [],
      isActive: false,
      startedAt: Date.now(),
    }

    const session: MultiAgentSession = {
      id: sessionId,
      config: fullConfig,
      state: sessionState,
      controller: null,
    }

    sessions.value.set(sessionId, session)
    return sessionId
  }

  /**
   * Start a session
   */
  async function startSession(sessionId: string): Promise<void> {
    const session = sessions.value.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Set as active
    activeSessionId.value = sessionId
    isRunning.value = true
    session.state.isActive = true

    // Create appropriate controller based on mode
    const controllerOptions = {
      session: session.state,
      generate: createGenerateFn(),
      getShortTermMemory: (agentId: string) =>
        agentMemories.value.get(`${sessionId}:${agentId}`),
      onEvent: async (event: MultiAgentEvent) => {
        lastEvent.value = event

        if (event.type === 'phase:changed') {
          currentPhase.value = event.phase
        }

        await options.onEvent?.(event)
      },
    }

    switch (session.config.mode) {
      case 'conversation':
        session.controller = new ConversationModeController(controllerOptions)
        break
      case 'debate':
        session.controller = new DebateModeController(controllerOptions)
        break
      case 'freedom':
        session.controller = new FreedomModeController(controllerOptions)
        break
    }

    // Start the controller
    try {
      await session.controller?.start()
    }
    catch (error) {
      isRunning.value = false
      throw error
    }
  }

  /**
   * Stop a session
   */
  function stopSession(sessionId?: string): void {
    const targetId = sessionId ?? activeSessionId.value
    if (!targetId)
      return

    const session = sessions.value.get(targetId)
    if (!session)
      return

    session.controller?.stop()
    session.state.isActive = false
    isRunning.value = false
  }

  /**
   * Delete a session
   */
  function deleteSession(sessionId: string): void {
    stopSession(sessionId)

    // Clean up memories
    const session = sessions.value.get(sessionId)
    if (session) {
      for (const agent of session.config.agents) {
        agentMemories.value.delete(`${sessionId}:${agent.id}`)
      }
    }

    sessions.value.delete(sessionId)

    if (activeSessionId.value === sessionId) {
      activeSessionId.value = null
    }
  }

  /**
   * Get agent position in 3D space
   */
  function getAgentPosition(agentId: string): Vector3 | null {
    if (!activeSession.value)
      return null
    return activeSession.value.state.agents.get(agentId)?.position ?? null
  }

  /**
   * Get all agent positions (for 3D rendering)
   */
  function getAllAgentPositions(): Map<string, Vector3> {
    const positions = new Map<string, Vector3>()
    if (!activeSession.value)
      return positions

    for (const [agentId, state] of activeSession.value.state.agents) {
      positions.set(agentId, state.position)
    }
    return positions
  }

  /**
   * Trigger an interaction between agents (freedom mode)
   */
  async function triggerInteraction(fromAgentId: string, toAgentId: string, topic?: string): Promise<void> {
    const session = activeSession.value
    if (!session || session.config.mode !== 'freedom')
      return

    const controller = session.controller as FreedomModeController
    await controller.triggerInteraction(fromAgentId, toAgentId, topic)
  }

  /**
   * Add a goal to an agent (freedom mode)
   */
  function addAgentGoal(agentId: string, goal: { description: string, priority: number, type: 'explore' | 'interact' | 'task' | 'idle', target?: string | Vector3 }): void {
    const session = activeSession.value
    if (!session || session.config.mode !== 'freedom')
      return

    const controller = session.controller as FreedomModeController
    controller.addGoal(agentId, goal)
  }

  /**
   * Get short-term memory for an agent
   */
  function getAgentMemory(agentId: string): ShortTermMemory | undefined {
    if (!activeSessionId.value)
      return undefined
    return agentMemories.value.get(`${activeSessionId.value}:${agentId}`)
  }

  // Clean up on unmount
  function cleanup(): void {
    for (const sessionId of sessions.value.keys()) {
      stopSession(sessionId)
    }
    sessions.value.clear()
    agentMemories.value.clear()
    activeSessionId.value = null
  }

  return {
    // State
    sessions,
    activeSessionId,
    activeSession,
    activeAgents,
    isRunning,
    currentPhase,
    conversationHistory,
    finalSynthesis,
    lastEvent,
    worldManager,

    // Actions
    createSession,
    startSession,
    stopSession,
    deleteSession,
    getAgentPosition,
    getAllAgentPositions,
    triggerInteraction,
    addAgentGoal,
    getAgentMemory,
    cleanup,
  }
}
