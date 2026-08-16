/**
 * Multi-Agent System Types
 *
 * Defines the configuration and runtime types for the multi-agent orchestration system.
 */

// Re-export Message type for consumers
export type { Message } from '@xsai/shared-chat'

/**
 * Agent role in the multi-agent system
 */
export type AgentRole
  = | 'pro' // Supports/defends a position
    | 'con' // Opposes/critiques a position
    | 'moderator' // Facilitates discussion, enforces rules
    | 'planner' // Creates and manages plans
    | 'critic' // Provides critical analysis
    | 'explorer' // Autonomous exploration agent
    | 'synthesizer' // Combines ideas into solutions
    | 'custom' // User-defined role

/**
 * Interaction mode for the multi-agent system
 */
export type InteractionMode
  = | 'conversation' // Collaborative topic discussion
    | 'debate' // Structured debate with sides
    | 'freedom' // Autonomous roaming mode

/**
 * Memory configuration for an agent
 */
export interface AgentMemoryConfig {
  /** Maximum short-term memory entries */
  shortTermCapacity: number
  /** Whether to enable long-term memory persistence */
  enableLongTerm: boolean
  /** Summarization interval in turns for long-term memory */
  summarizationCadence?: number
  /** Time-to-live for low-value memory items (ms) */
  ttlLowValueMs?: number
  /** Whether to share memory with other agents */
  enableSharedMemory?: boolean
}

/**
 * Model/runtime configuration for an agent
 */
export interface AgentModelConfig {
  /** Provider ID (e.g., 'openai', 'ollama', 'vllm') */
  provider: string
  /** Model identifier */
  model: string
  /** Temperature for generation */
  temperature?: number
  /** Maximum tokens for generation */
  maxTokens?: number
  /** GPU device index for model placement (-1 for auto) */
  gpuDevice?: number
  /** API base URL override */
  baseUrl?: string
  /** API key (for cloud providers) */
  apiKey?: string
}

/**
 * Avatar/body configuration for 3D presence
 */
export interface AgentAvatarConfig {
  /** VRM model URL or path */
  modelUrl?: string
  /** Initial position in 3D space */
  initialPosition?: Vector3
  /** Movement speed */
  movementSpeed?: number
  /** Idle animation URL */
  idleAnimationUrl?: string
}

/**
 * 3D Vector type
 */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/**
 * Full agent configuration
 */
export interface AgentConfig {
  /** Unique agent identifier */
  id: string
  /** Display name */
  name: string
  /** System prompt defining persona and rules */
  systemPrompt: string
  /** Optional role assignment */
  role?: AgentRole
  /** Model/runtime settings */
  model: AgentModelConfig
  /** Memory settings */
  memory: AgentMemoryConfig
  /** Avatar/body settings for 3D presence */
  avatar?: AgentAvatarConfig
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Multi-agent session configuration
 */
export interface MultiAgentSessionConfig {
  /** Session identifier */
  id: string
  /** List of agent configurations */
  agents: AgentConfig[]
  /** Interaction mode */
  mode: InteractionMode
  /** Mode-specific settings */
  modeSettings?: ConversationModeSettings | DebateModeSettings | FreedomModeSettings
  /** Topic or goal for the session */
  topic?: string
  /** Session constraints */
  constraints?: SessionConstraints
}

/**
 * Session constraints
 */
export interface SessionConstraints {
  /** Maximum number of turns */
  maxTurns?: number
  /** Maximum duration in milliseconds */
  maxDurationMs?: number
  /** Whether to require consensus */
  requireConsensus?: boolean
}

/**
 * Conversation mode settings
 */
export interface ConversationModeSettings {
  /** Turn order strategy */
  turnOrder: 'round-robin' | 'natural' | 'moderator-controlled'
  /** Whether agents can ask each other questions */
  enableQuestions: boolean
  /** Target: reach shared conclusion */
  targetConsensus: boolean
}

/**
 * Debate mode settings
 */
export interface DebateModeSettings {
  /** Debate phases */
  phases: DebatePhase[]
  /** Whether to include a moderator */
  includeModerator: boolean
  /** Time limit per phase in milliseconds */
  phaseDurationMs?: number
  /** Whether to produce a final synthesis */
  produceFinalSynthesis: boolean
}

/**
 * Debate phase definition
 */
export interface DebatePhase {
  name: 'opening' | 'rebuttal' | 'cross-examination' | 'closing' | 'synthesis'
  /** Which agent IDs participate in this phase */
  participants: string[]
  /** Maximum turns in this phase */
  maxTurns?: number
}

/**
 * Freedom mode settings
 */
export interface FreedomModeSettings {
  /** Loop interval in milliseconds */
  loopIntervalMs: number
  /** Whether agents can interact with each other */
  enableInterAgentChat: boolean
  /** Agent goals/tasks */
  agentGoals?: Record<string, AgentGoal[]>
  /** World boundaries */
  worldBounds?: WorldBounds
}

/**
 * Agent goal for freedom mode
 */
export interface AgentGoal {
  /** Goal identifier */
  id: string
  /** Goal description */
  description: string
  /** Priority (higher = more important) */
  priority: number
  /** Goal type */
  type: 'explore' | 'interact' | 'task' | 'idle'
  /** Target location or entity */
  target?: string | Vector3
}

/**
 * World boundaries for freedom mode
 */
export interface WorldBounds {
  min: Vector3
  max: Vector3
}

/**
 * Runtime agent state
 */
export interface AgentState {
  /** Agent configuration */
  config: AgentConfig
  /** Current position in 3D space */
  position: Vector3
  /** Current rotation (euler angles) */
  rotation: Vector3
  /** Current activity */
  activity: AgentActivity
  /** Current goals queue */
  goals: AgentGoal[]
  /** Whether the agent is currently speaking */
  isSpeaking: boolean
  /** Last message timestamp */
  lastMessageAt?: number
}

/**
 * Agent activity types
 */
export type AgentActivity
  = | { type: 'idle' }
    | { type: 'walking', destination: Vector3 }
    | { type: 'speaking', targetAgentId?: string }
    | { type: 'thinking' }
    | { type: 'interacting', targetId: string }

/**
 * Memory entry for short-term memory
 */
export interface ShortTermMemoryEntry {
  id: string
  timestamp: number
  type: 'message' | 'observation' | 'action' | 'thought'
  content: string
  agentId: string
  metadata?: Record<string, unknown>
}

/**
 * Memory entry for long-term memory
 */
export interface LongTermMemoryEntry {
  id: string
  createdAt: number
  updatedAt: number
  type: 'fact' | 'summary' | 'event' | 'preference'
  content: string
  agentId: string
  importance: number
  embedding?: number[]
  metadata?: Record<string, unknown>
}

/**
 * Multi-agent message type
 */
export interface MultiAgentMessage {
  id: string
  timestamp: number
  fromAgentId: string
  toAgentId?: string // undefined = broadcast
  content: string
  role: 'agent' | 'system' | 'user'
  phase?: string // For debate mode
  metadata?: Record<string, unknown>
}

/**
 * Turn in the multi-agent conversation
 */
export interface ConversationTurn {
  turnNumber: number
  agentId: string
  message: MultiAgentMessage
  responses?: MultiAgentMessage[]
  timestamp: number
}

/**
 * Session state for runtime
 */
export interface MultiAgentSessionState {
  config: MultiAgentSessionConfig
  agents: Map<string, AgentState>
  turns: ConversationTurn[]
  currentPhase?: string
  currentSpeaker?: string
  isActive: boolean
  startedAt: number
  endedAt?: number
  finalSynthesis?: string
}

/**
 * Event types for the multi-agent system
 */
export type MultiAgentEvent
  = | { type: 'session:started', sessionId: string }
    | { type: 'session:ended', sessionId: string, synthesis?: string }
    | { type: 'turn:started', turnNumber: number, agentId: string }
    | { type: 'turn:ended', turnNumber: number, agentId: string }
    | { type: 'message:sent', message: MultiAgentMessage }
    | { type: 'phase:changed', phase: string }
    | { type: 'agent:moved', agentId: string, from: Vector3, to: Vector3 }
    | { type: 'agent:activity', agentId: string, activity: AgentActivity }
    | { type: 'error', error: Error }

/**
 * GPU runtime configuration
 */
export interface GpuRuntimeConfig {
  /** Available GPU devices */
  devices: GpuDevice[]
  /** Model placement strategy */
  placementStrategy: 'round-robin' | 'memory-aware' | 'manual'
  /** Fallback behavior when VRAM is constrained */
  fallbackBehavior: 'queue' | 'cpu' | 'error'
}

/**
 * GPU device information
 */
export interface GpuDevice {
  id: number
  name: string
  totalMemoryMb: number
  freeMemoryMb: number
  assignedModels: string[]
}

/**
 * Configuration file schema (YAML/JSON)
 */
export interface MultiAgentConfigFile {
  version: string
  session: Omit<MultiAgentSessionConfig, 'id'>
  gpu?: GpuRuntimeConfig
}
