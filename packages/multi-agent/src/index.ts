/**
 * @proj-airi/multi-agent
 *
 * Multi-agent orchestration system for AIRI.
 * Supports conversation, debate, and freedom modes with 2-3 simultaneous AI agents.
 */

// Core
export {
  AgentInstance,
  createAgentInstance,
  createSessionFromConfig,
  generateExampleConfig,
  MultiAgentManager,
  parseConfig,
  stringifyConfig,
  validateConfig,
} from './core'

export type {
  AgentInstanceOptions,
  MultiAgentManagerOptions,
} from './core'
// Memory
export {
  LongTermMemory,
  ShortTermMemory,
} from './memory'

export type { MemoryWritePolicy } from './memory'
// Modes
export {
  BaseModeController,
  ConversationModeController,
  DebateModeController,
  FreedomModeController,
} from './modes'

export type {
  GenerateFn,
  ModeControllerOptions,
} from './modes'
// Types
export * from './types'

// World
export {
  WorldManager,
} from './world'
export type {
  NavNode,
  WorldArea,
  WorldConfig,
} from './world'
