---
title: Multi-Agent System
description: Local-only multi-assistant 3D system for AIRI
---

# Multi-Agent System

The AIRI Multi-Agent System enables 2-3 simultaneous AI assistants inside the same 3D scene. They can:

1. **Discuss a specific topic** together (collaborative mode)
2. **Debate a topic** (opposing roles + structured debate rules) and produce a **final synthesized solution**
3. Run in **Freedom Mode** where each agent roams the world independently

## Quick Start

### 1. Create a Configuration File

Create `config.yaml`:

```yaml
version: '1.0.0'
session:
  agents:
    - id: alice
      name: Alice
      systemPrompt: 'You are Alice, an enthusiastic debater who supports innovative ideas.'
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

    - id: bob
      name: Bob
      systemPrompt: 'You are Bob, a cautious analyst who values stability.'
      role: con
      model:
        provider: ollama
        model: llama3.2:latest
      memory:
        shortTermCapacity: 50
        enableLongTerm: true
      avatar:
        initialPosition: {x: 2, y: 0, z: 0}

  mode: debate
  topic: 'Should AI assistants have persistent memory across conversations?'

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
    includeModerator: false
    produceFinalSynthesis: true
```

### 2. Run with AIRI

```typescript
import {
  createSessionFromConfig,
  DebateModeController,
  parseConfig,
} from '@proj-airi/multi-agent'

// Load configuration
const configYaml = fs.readFileSync('config.yaml', 'utf-8')
const config = parseConfig(configYaml)
const sessionConfig = createSessionFromConfig(config)

// Start the debate
const controller = new DebateModeController({
  session: sessionState,
  generate: yourGenerateFunction,
  onEvent: event => console.log(event),
})

await controller.start()
```

## Interaction Modes

### Conversation Mode

Collaborative discussion where agents work towards consensus:

- **Turn Order**: Round-robin, natural (least recent speaker), or moderator-controlled
- **Questions**: Agents can ask each other questions
- **Consensus**: Work towards a shared conclusion

### Debate Mode

Structured debate with phases:

1. **Opening Statements** - Each side presents initial position
2. **Rebuttals** - Counter opposing arguments
3. **Cross-Examination** - Direct questions and challenges
4. **Closing Statements** - Final persuasive appeals
5. **Synthesis** - Moderator produces balanced conclusion

### Freedom Mode

Autonomous roaming behavior:

- **Independent Loops**: Each agent runs perceive → decide → act
- **Goals/Tasks**: Agents pursue assigned or generated goals
- **Inter-Agent Chat**: Agents can interact when near each other
- **Spatial Awareness**: Position tracking and pathfinding

## Memory System

### Short-Term Memory

Working context for current session:

- Recent messages and observations
- Current world state
- Configurable capacity (default: 100 entries)

### Long-Term Memory

Persistent storage across sessions:

- Important facts, summaries, and events
- Importance scoring (0-1 scale)
- TTL for low-value items
- Per-agent isolation with optional sharing

## Agent Configuration

Each agent requires:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Display name |
| `systemPrompt` | Persona and rules |
| `role` | Optional: pro, con, moderator, synthesizer |
| `model` | Provider, model, temperature, etc. |
| `memory` | Short-term capacity, long-term enable |
| `avatar` | Initial position, movement speed |

## Events

The system emits events for:

- `session:started` / `session:ended`
- `turn:started` / `turn:ended`
- `message:sent`
- `phase:changed`
- `agent:moved` / `agent:activity`
- `error`

## Next Steps

- [Local Deployment Guide](/docs/en/docs/multi-agent/deployment)
- [GPU Configuration](/docs/en/docs/multi-agent/gpu-config)
- [API Reference](/docs/en/docs/multi-agent/api-reference)
