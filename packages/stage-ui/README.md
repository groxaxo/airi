# Stage UI

Shared core for stage

## Button analytics

Register the shared plugin once in each Vue application:

```ts
import { trackButtonPlugin } from '@proj-airi/stage-ui/directives/track-button'

createApp(App)
  .use(trackButtonPlugin)
  .mount('#app')
```

Buttons that represent a product-analysis click intent can then declare a
typed event without wrapping their business handler:

```vue
<Button
  v-track-button="{ name: 'update_check_clicked', channel: selectedChannel }"
  @click="checkForUpdates()"
/>
```

Keep async outcomes, confirmed state changes, impressions, and lifecycle events
in their owning business flows instead of attaching them to the initial click.

## Dual-conversation stage

The `dual-stage` scene (`src/components/scenes/dual-stage.vue`) runs a live
conversation between two characters on one stage. Each side has its own VRM
display model, OpenAI-compatible chat and speech connections, model, and
voice; credentials stay in Provider settings.

- `src/services/dual-conversation-runtime.ts` — conversation lifecycle
  (`idle → generating → speaking → … → completed | stopped | failed`), turn
  streaming, interruption, and abort cleanup
- `src/stores/dual-conversation-configuration.ts` — per-side configuration
  and validation (distinct chat/speech connections required per character)
- `src/stores/dual-conversation.ts` — Pinia store wiring configuration,
  provider/voice catalogs, and the runtime (`useDualConversationStore`)

A seed message opens the topic; the two characters then continue autonomously
up to a configurable reply limit (0 = unlimited). UI strings live under the
`dual-conversation` key in `packages/i18n` locales.

## Multi-agent sessions

`src/composables/use-multi-agent.ts` exposes `useMultiAgent()`, a Vue
composable that bridges `@proj-airi/multi-agent` sessions with the stage:
agents draw chat responses from the existing providers store and are
positioned in the 3D scene through the world manager. It supports the
conversation, debate, and freedom mode controllers plus short-term memory,
and surfaces live session state (`sessions`, `activeSessionId`, `isRunning`,
`currentPhase`) and `MultiAgentEvent` callbacks. See
`packages/multi-agent/README.md` for the underlying system.

## Histoire (UI storyboard)

https://histoire.dev/

```shell
pnpm -F @proj-airi/stage-ui run story:dev
```

### Project structure

1. If a story is bound to a specific component, it can be placed beside the component in the `src` folder. e.g., `MyComponent.story.vue`
2. If a story is not bound to a specific component, then it should be placed in the `stories` folder. e.g., `MyStory.story.vue`
