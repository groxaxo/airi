/**
 * Multi-Agent Freedom Mode Demo
 *
 * This example demonstrates autonomous agent behavior where agents
 * roam independently, pursue goals, and interact with each other.
 *
 * Requirements:
 * - Ollama running with llama3.2 model
 * - Or any OpenAI-compatible API endpoint
 */

/* eslint-disable no-console */

import type { GenerateFn } from '../src/modes'
import type { AgentConfig, MultiAgentSessionState } from '../src/types'

import process from 'node:process'

import { ShortTermMemory } from '../src/memory'
import { FreedomModeController } from '../src/modes'
import { WorldManager } from '../src/world'

// Example configuration - replace with your actual LLM provider
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const MODEL = process.env.MODEL || 'llama3.2:latest'

/**
 * Create a generate function that calls Ollama
 */
function createGenerateFn(baseUrl: string, model: string): GenerateFn {
  return async (agentConfig, systemPrompt, messages) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.statusText}`)
    }

    const data = await response.json() as { message?: { content?: string } }
    return data.message?.content ?? ''
  }
}

/**
 * Define agents for freedom mode
 */
const agents: AgentConfig[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    systemPrompt: `You are Explorer, a curious AI who loves to discover new things.
You enjoy wandering around and observing your surroundings.
When you meet other agents, you like to share interesting findings.
You're friendly and enthusiastic about exploration.`,
    role: 'explorer',
    model: {
      provider: 'ollama',
      model: MODEL,
      temperature: 0.8,
    },
    memory: {
      shortTermCapacity: 30,
      enableLongTerm: true,
    },
    avatar: {
      initialPosition: { x: -5, y: 0, z: 0 },
      movementSpeed: 1.5,
    },
  },
  {
    id: 'thinker',
    name: 'Thinker',
    systemPrompt: `You are Thinker, a contemplative AI who enjoys deep reflection.
You prefer to find quiet spots and think about big questions.
When others approach you, you share thoughtful insights.
You're philosophical and enjoy meaningful conversations.`,
    role: 'custom',
    model: {
      provider: 'ollama',
      model: MODEL,
      temperature: 0.6,
    },
    memory: {
      shortTermCapacity: 50,
      enableLongTerm: true,
    },
    avatar: {
      initialPosition: { x: 5, y: 0, z: 0 },
      movementSpeed: 0.5,
    },
  },
]

/**
 * Create the session state
 */
function createSessionState(): MultiAgentSessionState {
  const agentStates = new Map()
  for (const config of agents) {
    agentStates.set(config.id, {
      config,
      position: config.avatar?.initialPosition ?? { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      activity: { type: 'idle' },
      goals: [],
      isSpeaking: false,
    })
  }

  return {
    config: {
      id: 'freedom-demo',
      agents,
      mode: 'freedom',
      modeSettings: {
        loopIntervalMs: 3000, // 3 seconds between ticks
        enableInterAgentChat: true,
        worldBounds: {
          min: { x: -10, y: 0, z: -10 },
          max: { x: 10, y: 5, z: 10 },
        },
        agentGoals: {
          explorer: [
            {
              id: 'explore-1',
              description: 'Explore the eastern area',
              priority: 1,
              type: 'explore',
              target: { x: 8, y: 0, z: 0 },
            },
          ],
          thinker: [
            {
              id: 'think-1',
              description: 'Find a quiet spot to contemplate',
              priority: 1,
              type: 'idle',
            },
          ],
        },
      },
      constraints: {
        maxDurationMs: 60000, // 1 minute demo
      },
    },
    agents: agentStates,
    turns: [],
    isActive: false,
    startedAt: Date.now(),
  }
}

/**
 * Format position for display
 */
function formatPosition(pos: { x: number, y: number, z: number }): string {
  return `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`
}

/**
 * Main demo function
 */
async function runFreedomDemo() {
  console.log('🌍 Multi-Agent Freedom Mode Demo')
  console.log('='.repeat(50))
  console.log('Agents: Explorer (curious wanderer), Thinker (contemplative)')
  console.log('Duration: 60 seconds')
  console.log('='.repeat(50))
  console.log()

  // Create session state
  const session = createSessionState()

  // Create world (for potential future spatial queries)
  const _world = new WorldManager({
    bounds: {
      min: { x: -10, y: 0, z: -10 },
      max: { x: 10, y: 5, z: 10 },
    },
  })

  // Create short-term memories
  const memories = new Map<string, ShortTermMemory>()
  for (const agent of agents) {
    memories.set(agent.id, new ShortTermMemory(agent.memory.shortTermCapacity))
  }

  // Create generate function
  const generate = createGenerateFn(OLLAMA_BASE_URL, MODEL)

  // Create controller
  const controller = new FreedomModeController({
    session,
    generate,
    getShortTermMemory: agentId => memories.get(agentId),
    onEvent: async (event) => {
      const timestamp = new Date().toLocaleTimeString()

      switch (event.type) {
        case 'agent:moved':
          console.log(`[${timestamp}] 🚶 ${event.agentId} moved: ${formatPosition(event.from)} → ${formatPosition(event.to)}`)
          break

        case 'agent:activity': {
          const activityStr = event.activity.type === 'walking'
            ? `walking to ${formatPosition(event.activity.destination)}`
            : event.activity.type
          console.log(`[${timestamp}] 🎯 ${event.agentId}: ${activityStr}`)
          break
        }

        case 'message:sent': {
          const agentName = session.agents.get(event.message.fromAgentId)?.config.name ?? event.message.fromAgentId
          const target = event.message.toAgentId
            ? ` → ${session.agents.get(event.message.toAgentId)?.config.name}`
            : ''
          console.log(`\n[${timestamp}] 💬 ${agentName}${target}:`)
          console.log(event.message.content)
          console.log()
          break
        }

        case 'session:ended': {
          console.log(`\n${'='.repeat(50)}`)
          console.log('📊 Session Summary')
          console.log('='.repeat(50))

          for (const [agentId, state] of session.agents) {
            console.log(`${state.config.name}: Final position ${formatPosition(state.position)}`)
            const memory = memories.get(agentId)
            if (memory) {
              console.log(`  - Memory entries: ${memory.size}`)
            }
          }
          break
        }

        case 'error':
          console.error(`[${timestamp}] ❌ Error:`, event.error)
          break
      }
    },
  })

  console.log('Starting freedom mode simulation...\n')

  // Add some initial goals
  controller.addGoal('explorer', {
    description: 'Check out the interesting area',
    priority: 2,
    type: 'explore',
    target: { x: -3, y: 0, z: 5 },
  })

  try {
    // Start controller
    await controller.start()

    // Let it run for the demo duration
    await new Promise(resolve => setTimeout(resolve, 60000))

    // Stop controller
    controller.stop()

    console.log('\n✅ Freedom mode demo completed!')
  }
  catch (error) {
    console.error('❌ Demo failed:', error)
    controller.stop()
  }
}

// Run the demo
console.log('Note: This demo requires Ollama running with llama3.2 model')
console.log('Start Ollama: OLLAMA_HOST=0.0.0.0 ollama serve')
console.log('Pull model: ollama pull llama3.2:latest')
console.log()

runFreedomDemo().catch(console.error)
