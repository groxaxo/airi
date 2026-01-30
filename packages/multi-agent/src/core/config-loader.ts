/**
 * Configuration Loader
 *
 * Loads and validates multi-agent configuration from YAML or JSON files.
 */

import type { MultiAgentConfigFile, MultiAgentSessionConfig } from '../types'

import { nanoid } from 'nanoid'

import * as yaml from 'yaml'

/**
 * Parse a configuration string (YAML or JSON)
 */
export function parseConfig(content: string, format: 'yaml' | 'json' = 'yaml'): MultiAgentConfigFile {
  if (format === 'json') {
    return JSON.parse(content) as MultiAgentConfigFile
  }
  return yaml.parse(content) as MultiAgentConfigFile
}

/**
 * Create a session config from a config file
 */
export function createSessionFromConfig(config: MultiAgentConfigFile): MultiAgentSessionConfig {
  return {
    id: nanoid(),
    ...config.session,
  }
}

/**
 * Validate a configuration file
 */
export function validateConfig(config: MultiAgentConfigFile): { valid: boolean, errors: string[] } {
  const errors: string[] = []

  // Check version
  if (!config.version) {
    errors.push('Missing version field')
  }

  // Check session
  if (!config.session) {
    errors.push('Missing session field')
    return { valid: false, errors }
  }

  // Check agents
  if (!config.session.agents || config.session.agents.length === 0) {
    errors.push('Session must have at least one agent')
  }
  else {
    for (let i = 0; i < config.session.agents.length; i++) {
      const agent = config.session.agents[i]
      if (!agent.id) {
        errors.push(`Agent ${i} is missing id`)
      }
      if (!agent.name) {
        errors.push(`Agent ${agent.id ?? i} is missing name`)
      }
      if (!agent.systemPrompt) {
        errors.push(`Agent ${agent.id ?? i} is missing systemPrompt`)
      }
      if (!agent.model) {
        errors.push(`Agent ${agent.id ?? i} is missing model configuration`)
      }
      else {
        if (!agent.model.provider) {
          errors.push(`Agent ${agent.id ?? i} model is missing provider`)
        }
        if (!agent.model.model) {
          errors.push(`Agent ${agent.id ?? i} model is missing model name`)
        }
      }
      if (!agent.memory) {
        errors.push(`Agent ${agent.id ?? i} is missing memory configuration`)
      }
    }
  }

  // Check mode
  const validModes = ['conversation', 'debate', 'freedom']
  if (!config.session.mode) {
    errors.push('Session is missing mode')
  }
  else if (!validModes.includes(config.session.mode)) {
    errors.push(`Invalid mode: ${config.session.mode}. Must be one of: ${validModes.join(', ')}`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Generate an example configuration file
 */
export function generateExampleConfig(): MultiAgentConfigFile {
  return {
    version: '1.0.0',
    session: {
      agents: [
        {
          id: 'alice',
          name: 'Alice',
          systemPrompt: 'You are Alice, an enthusiastic debater who supports innovative ideas and technological progress. You value creativity and forward-thinking approaches.',
          role: 'pro',
          model: {
            provider: 'ollama',
            model: 'llama3.2:latest',
            temperature: 0.7,
            maxTokens: 1024,
          },
          memory: {
            shortTermCapacity: 50,
            enableLongTerm: true,
            summarizationCadence: 10,
          },
          avatar: {
            initialPosition: { x: -2, y: 0, z: 0 },
            movementSpeed: 1,
          },
        },
        {
          id: 'bob',
          name: 'Bob',
          systemPrompt: 'You are Bob, a cautious analyst who values stability and proven solutions. You excel at identifying potential risks and advocating for measured approaches.',
          role: 'con',
          model: {
            provider: 'ollama',
            model: 'llama3.2:latest',
            temperature: 0.7,
            maxTokens: 1024,
          },
          memory: {
            shortTermCapacity: 50,
            enableLongTerm: true,
            summarizationCadence: 10,
          },
          avatar: {
            initialPosition: { x: 2, y: 0, z: 0 },
            movementSpeed: 1,
          },
        },
        {
          id: 'charlie',
          name: 'Charlie',
          systemPrompt: 'You are Charlie, a neutral moderator who ensures fair discussion, asks clarifying questions, and helps synthesize different viewpoints into balanced conclusions.',
          role: 'moderator',
          model: {
            provider: 'ollama',
            model: 'llama3.2:latest',
            temperature: 0.5,
            maxTokens: 1024,
          },
          memory: {
            shortTermCapacity: 100,
            enableLongTerm: true,
          },
          avatar: {
            initialPosition: { x: 0, y: 0, z: 2 },
            movementSpeed: 0.5,
          },
        },
      ],
      mode: 'debate',
      topic: 'Should AI assistants have persistent memory across conversations?',
      modeSettings: {
        phases: [
          { name: 'opening', participants: ['alice', 'bob'], maxTurns: 1 },
          { name: 'rebuttal', participants: ['alice', 'bob'], maxTurns: 2 },
          { name: 'cross-examination', participants: ['alice', 'bob'], maxTurns: 2 },
          { name: 'closing', participants: ['alice', 'bob'], maxTurns: 1 },
          { name: 'synthesis', participants: ['charlie'], maxTurns: 1 },
        ],
        includeModerator: true,
        produceFinalSynthesis: true,
      },
      constraints: {
        maxTurns: 20,
        maxDurationMs: 300000, // 5 minutes
      },
    },
    gpu: {
      devices: [
        { id: 0, name: 'GPU 0', totalMemoryMb: 24000, freeMemoryMb: 20000, assignedModels: [] },
      ],
      placementStrategy: 'memory-aware',
      fallbackBehavior: 'queue',
    },
  }
}

/**
 * Stringify configuration to YAML or JSON
 */
export function stringifyConfig(config: MultiAgentConfigFile, format: 'yaml' | 'json' = 'yaml'): string {
  if (format === 'json') {
    return JSON.stringify(config, null, 2)
  }
  return yaml.stringify(config)
}
