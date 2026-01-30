# @proj-airi/multi-agent

Multi-agent orchestration system for AIRI. Supports 2-3 simultaneous AI assistants that can:

1. **Discuss a specific topic** together (collaborative mode)
2. **Debate a topic** (opposing roles + structured debate rules) and produce a final synthesized solution
3. Run in a **Freedom Mode** where each agent roams independently while following its own goals

## Installation

```bash
pnpm add @proj-airi/multi-agent
```

## Quick Start

```typescript
import {
  ConversationModeController,
  DebateModeController,
  FreedomModeController,
  MultiAgentManager,
  parseConfig,
} from '@proj-airi/multi-agent'

// Create the manager
const manager = new MultiAgentManager({
  onEvent: event => console.log('Event:', event.type),
})

// Create a session from config
const sessionId = await manager.createSession({
  agents: [
    {
      id: 'alice',
      name: 'Alice',
      systemPrompt: 'You are Alice, an enthusiastic supporter of innovation.',
      role: 'pro',
      model: { provider: 'ollama', model: 'llama3.2:latest' },
      memory: { shortTermCapacity: 50, enableLongTerm: true },
    },
    {
      id: 'bob',
      name: 'Bob',
      systemPrompt: 'You are Bob, a cautious analyst who values stability.',
      role: 'con',
      model: { provider: 'ollama', model: 'llama3.2:latest' },
      memory: { shortTermCapacity: 50, enableLongTerm: true },
    },
  ],
  mode: 'debate',
  topic: 'Should AI have persistent memory?',
})

// Start the session
await manager.startSession(sessionId)
```

## Configuration

The system can be configured via YAML or JSON files:

```yaml
version: '1.0.0'
session:
  agents:
    - id: alice
      name: Alice
      systemPrompt: 'You are Alice, an enthusiastic debater...'
      role: pro
      model:
        provider: ollama
        model: llama3.2:latest
        temperature: 0.7
      memory:
        shortTermCapacity: 50
        enableLongTerm: true
      avatar:
        initialPosition: {x: -2, y: 0, z: 0}
        movementSpeed: 1

    - id: bob
      name: Bob
      systemPrompt: 'You are Bob, a cautious analyst...'
      role: con
      model:
        provider: ollama
        model: llama3.2:latest
      memory:
        shortTermCapacity: 50
        enableLongTerm: true

  mode: debate
  topic: 'Should AI assistants have persistent memory?'

  modeSettings:
    phases:
      - name: opening
        participants: [alice, bob]
        maxTurns: 1
      - name: rebuttal
        participants: [alice, bob]
        maxTurns: 2
      - name: closing
        participants: [alice, bob]
        maxTurns: 1
      - name: synthesis
        participants: [charlie]
        maxTurns: 1
    includeModerator: true
    produceFinalSynthesis: true

gpu:
  devices:
    - id: 0
      name: 'GPU 0'
      totalMemoryMb: 24000
      freeMemoryMb: 20000
      assignedModels: []
  placementStrategy: memory-aware
  fallbackBehavior: queue
```

## Interaction Modes

### Conversation Mode

Collaborative discussion where agents work towards consensus:

```typescript
const controller = new ConversationModeController({
  session: sessionState,
  generate: yourGenerateFunction,
})

await controller.start()
```

Settings:
- `turnOrder`: 'round-robin' | 'natural' | 'moderator-controlled'
- `enableQuestions`: Allow agents to ask each other questions
- `targetConsensus`: Work towards shared conclusion

### Debate Mode

Structured debate with phases and optional moderator:

```typescript
const controller = new DebateModeController({
  session: sessionState,
  generate: yourGenerateFunction,
})

await controller.start()
```

Phases:
1. **Opening statements** - Initial positions
2. **Rebuttals** - Counter opposing arguments
3. **Cross-examination** - Questions and challenges
4. **Closing statements** - Final arguments
5. **Synthesis** - Moderator/synthesizer produces final answer

### Freedom Mode

Autonomous roaming with independent goals:

```typescript
const controller = new FreedomModeController({
  session: sessionState,
  generate: yourGenerateFunction,
})

await controller.start()

// Add goals dynamically
controller.addGoal('alice', {
  description: 'Explore the garden area',
  priority: 1,
  type: 'explore',
})

// Trigger interactions
await controller.triggerInteraction('alice', 'bob', 'weather')
```

## Memory System

### Short-Term Memory

Working context for current conversation:

```typescript
import { ShortTermMemory } from '@proj-airi/multi-agent'

const shortTerm = new ShortTermMemory(100) // capacity

shortTerm.addEntry({
  type: 'message',
  content: 'Hello!',
  agentId: 'alice',
})

const recent = shortTerm.getRecentEntries(10)
```

### Long-Term Memory

Persistent storage with importance scoring:

```typescript
import { LongTermMemory } from '@proj-airi/multi-agent'

const longTerm = new LongTermMemory('alice', {
  minImportance: 0.3,
  maxEntries: 1000,
  ttlLowValueMs: 7 * 24 * 60 * 60 * 1000, // 7 days
})

longTerm.store({
  type: 'fact',
  content: 'Important discovery',
  importance: 0.8,
})

const relevant = longTerm.findRelevant(10)
```

## 3D World System

```typescript
import { WorldManager } from '@proj-airi/multi-agent'

const world = new WorldManager({
  bounds: {
    min: { x: -20, y: 0, z: -20 },
    max: { x: 20, y: 10, z: 20 },
  },
  gridResolution: 1,
})

// Check walkability
const walkable = world.isWalkable({ x: 5, y: 0, z: 5 })

// Find path
const path = world.findPath(
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 10 }
)

// Get random position
const position = world.getRandomWalkablePosition()
```

## Local Deployment

### Requirements

- Ubuntu Server 22.04+
- Multiple NVIDIA CUDA GPUs
- 96GB+ RAM
- Docker or Conda

### GPU Configuration

```yaml
gpu:
  devices:
    - id: 0
      name: 'NVIDIA RTX 4090'
      totalMemoryMb: 24576
      freeMemoryMb: 20000
      assignedModels: ['llama3.2:latest']
    - id: 1
      name: 'NVIDIA RTX 4090'
      totalMemoryMb: 24576
      freeMemoryMb: 24576
      assignedModels: []
  placementStrategy: memory-aware # or 'round-robin', 'manual'
  fallbackBehavior: queue # or 'cpu', 'error'
```

### Running with Ollama

```bash
# Start Ollama with GPU support
OLLAMA_HOST=0.0.0.0 ollama serve

# Pull models
ollama pull llama3.2:latest

# Run your multi-agent session
```

### Running with vLLM

```bash
# Start vLLM server
vllm serve meta-llama/Llama-3.2-3B-Instruct \
  --tensor-parallel-size 2 \
  --gpu-memory-utilization 0.9

# Configure agents to use vLLM
agents:
  - model:
      provider: vllm
      model: meta-llama/Llama-3.2-3B-Instruct
      baseUrl: http://localhost:8000/v1
```

## API Reference

See the TypeScript types in `src/types/index.ts` for complete API documentation.

## License

MIT
