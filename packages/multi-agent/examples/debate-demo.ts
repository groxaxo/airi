/**
 * Multi-Agent Debate Demo
 *
 * This example demonstrates a structured debate between two AI agents
 * with a moderator producing a final synthesis.
 *
 * Requirements:
 * - Ollama running with llama3.2 model
 * - Or any OpenAI-compatible API endpoint
 */

import type { GenerateFn } from '../src/modes'
import type { AgentConfig, MultiAgentSessionState } from '../src/types'

import { ShortTermMemory } from '../src/memory'
import { DebateModeController } from '../src/modes'

// Example configuration - replace with your actual LLM provider
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const MODEL = process.env.MODEL || 'llama3.2:latest'

/**
 * Create a generate function that calls an OpenAI-compatible API
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
 * Define the agents for our debate
 */
const agents: AgentConfig[] = [
  {
    id: 'alice',
    name: 'Alice',
    systemPrompt: `You are Alice, an enthusiastic technology advocate who believes in progress and innovation.
You support the proposition that AI assistants should have persistent memory.
You value creativity, user experience, and the potential for AI to better understand and help users.
Be persuasive but respectful. Use concrete examples when possible.`,
    role: 'pro',
    model: {
      provider: 'ollama',
      model: MODEL,
      temperature: 0.7,
    },
    memory: {
      shortTermCapacity: 50,
      enableLongTerm: true,
    },
    avatar: {
      initialPosition: { x: -2, y: 0, z: 0 },
    },
  },
  {
    id: 'bob',
    name: 'Bob',
    systemPrompt: `You are Bob, a cautious security analyst who prioritizes privacy and user protection.
You oppose the proposition that AI assistants should have persistent memory.
You value data privacy, security, and user control over their information.
Be analytical and cite potential risks. Present counterarguments thoughtfully.`,
    role: 'con',
    model: {
      provider: 'ollama',
      model: MODEL,
      temperature: 0.7,
    },
    memory: {
      shortTermCapacity: 50,
      enableLongTerm: true,
    },
    avatar: {
      initialPosition: { x: 2, y: 0, z: 0 },
    },
  },
  {
    id: 'charlie',
    name: 'Charlie',
    systemPrompt: `You are Charlie, a neutral moderator and synthesizer.
Your role is to:
1. Ensure fair discussion between both sides
2. Ask clarifying questions when needed
3. Identify common ground and key disagreements
4. Produce a balanced final synthesis that incorporates valid points from both sides
Be objective, fair, and constructive in your synthesis.`,
    role: 'moderator',
    model: {
      provider: 'ollama',
      model: MODEL,
      temperature: 0.5,
    },
    memory: {
      shortTermCapacity: 100,
      enableLongTerm: true,
    },
    avatar: {
      initialPosition: { x: 0, y: 0, z: 2 },
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
      id: 'debate-demo',
      agents,
      mode: 'debate',
      topic: 'Should AI assistants have persistent memory across conversations?',
      modeSettings: {
        phases: [
          { name: 'opening', participants: ['alice', 'bob'], maxTurns: 1 },
          { name: 'rebuttal', participants: ['alice', 'bob'], maxTurns: 1 },
          { name: 'cross-examination', participants: ['alice', 'bob'], maxTurns: 1 },
          { name: 'closing', participants: ['alice', 'bob'], maxTurns: 1 },
          { name: 'synthesis', participants: ['charlie'], maxTurns: 1 },
        ],
        includeModerator: true,
        produceFinalSynthesis: true,
      },
      constraints: {
        maxTurns: 15,
        maxDurationMs: 300000, // 5 minutes
      },
    },
    agents: agentStates,
    turns: [],
    isActive: false,
    startedAt: Date.now(),
  }
}

/**
 * Main demo function
 */
async function runDebateDemo() {
  console.log('🎭 Multi-Agent Debate Demo')
  console.log('='.repeat(50))
  console.log(`Topic: Should AI assistants have persistent memory?`)
  console.log(`Agents: Alice (Pro), Bob (Con), Charlie (Moderator)`)
  console.log('='.repeat(50))
  console.log()

  // Create session state
  const session = createSessionState()

  // Create short-term memories
  const memories = new Map<string, ShortTermMemory>()
  for (const agent of agents) {
    memories.set(agent.id, new ShortTermMemory(agent.memory.shortTermCapacity))
  }

  // Create generate function
  const generate = createGenerateFn(OLLAMA_BASE_URL, MODEL)

  // Create controller
  const controller = new DebateModeController({
    session,
    generate,
    getShortTermMemory: agentId => memories.get(agentId),
    onEvent: async (event) => {
      switch (event.type) {
        case 'phase:changed':
          console.log(`\n📍 Phase: ${event.phase.toUpperCase()}`)
          console.log('-'.repeat(40))
          break

        case 'message:sent':
          const agentName = session.agents.get(event.message.fromAgentId)?.config.name ?? event.message.fromAgentId
          console.log(`\n💬 ${agentName}:`)
          console.log(event.message.content)
          break

        case 'session:ended':
          console.log(`\n${'='.repeat(50)}`)
          console.log('📝 FINAL SYNTHESIS')
          console.log('='.repeat(50))
          if (event.synthesis) {
            console.log(event.synthesis)
          }
          break

        case 'error':
          console.error('❌ Error:', event.error)
          break
      }
    },
  })

  console.log('Starting debate...\n')

  try {
    await controller.start()
    console.log('\n✅ Debate completed successfully!')
  }
  catch (error) {
    console.error('❌ Debate failed:', error)
  }
}

// Run the demo
console.log('Note: This demo requires Ollama running with llama3.2 model')
console.log('Start Ollama: OLLAMA_HOST=0.0.0.0 ollama serve')
console.log('Pull model: ollama pull llama3.2:latest')
console.log()

runDebateDemo().catch(console.error)
