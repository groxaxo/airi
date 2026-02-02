# MultiAvatarScene Quick Start

This is a minimal example showing how to use the `MultiAvatarScene` component to render two VRM avatars facing each other.

## Installation

The component is part of the `@proj-airi/stage-ui-three` package:

```bash
pnpm add @proj-airi/stage-ui-three
```

## Basic Example

```vue
<script setup lang="ts">
import { MultiAvatarScene } from '@proj-airi/stage-ui-three'
import { ref } from 'vue'

const sceneRef = ref<InstanceType<typeof MultiAvatarScene>>()

// Configure two avatars
const avatarConfigs = [
  {
    modelSrc: '/models/avatar1.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: -0.6, y: 0, z: 0 }, // Position left
  },
  {
    modelSrc: '/models/avatar2.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: 0.6, y: 0, z: 0 }, // Position right
  },
]

function handleReady() {
  console.log('Scene is ready!')
  // You can now control avatars
  sceneRef.value?.setExpression(0, 'happy', 1.0)
}

function handleError(error: unknown) {
  console.error('Scene error:', error)
}
</script>

<template>
  <MultiAvatarScene
    ref="sceneRef"
    :avatar-configs="avatarConfigs"
    env-select="hemisphere"
    @ready="handleReady"
    @error="handleError"
  />
</template>
```

## Controlling Avatars

Once the scene is ready, you can control individual avatars:

```ts
// Set expression on first avatar (index 0)
sceneRef.value?.setExpression(0, 'happy', 1.0)

// Set expression on second avatar (index 1)
sceneRef.value?.setExpression(1, 'surprised', 0.8)

// Update gaze target
sceneRef.value?.lookAtUpdate(0, { x: 1, y: 1.5, z: 0 })

// Set frame hook for custom animations
sceneRef.value?.setVrmFrameHook(0, (vrm, delta) => {
  // Custom per-frame logic
})
```

## Features

- ✅ **Multiple avatars** - Render 2+ VRM models in one scene
- ✅ **Independent control** - Each avatar has separate state and methods
- ✅ **Automatic positioning** - Avatars look at each other by default
- ✅ **Shared environment** - One camera and lighting setup for efficiency

## See Full Documentation

For detailed documentation, see [MultiAvatarScene.md](./MultiAvatarScene.md)

## Differences from ThreeScene

Unlike `ThreeScene`, which uses a global Pinia store and is designed for single-avatar viewing, `MultiAvatarScene`:

- Does **not** use `useModelStore`
- Manages state independently for each avatar
- Provides per-avatar control methods
- Is designed for multi-character scenes

## Requirements

You need VRM model files (.vrm) and VRMA animation files (.vrma) to use this component. The default idle animation is included in the package at:

```
@proj-airi/stage-ui-three/assets/vrm/animations/idle_loop.vrma
```

## Example File Structure

```
public/
├── models/
│   ├── avatar1.vrm
│   └── avatar2.vrm
└── animations/
    └── idle.vrma
```

Then reference them in your code:

```ts
const avatarConfigs = [
  {
    modelSrc: '/models/avatar1.vrm',
    idleAnimation: '/animations/idle.vrma',
    // ...
  },
]
```
