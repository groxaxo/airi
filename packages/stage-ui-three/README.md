# stage-ui-three

A collection of 3D scene components for Project AIRI, built with Vue 3, Three.js, and TresJS.

## Components

### ThreeScene

The primary component for rendering a single VRM avatar with full interactivity and state management via Pinia.

**Features:**
- Single VRM model viewer
- Global state management with `useModelStore`
- Camera controls, lighting, and environment setup
- Expression control, lip-sync, and animation support

**Usage:**
```vue
<script setup lang="ts">
import { ThreeScene } from '@proj-airi/stage-ui-three'
</script>

<template>
  <ThreeScene
    model-src="/models/avatar.vrm"
    idle-animation="/animations/idle.vrma"
  />
</template>
```

### MultiAvatarScene (NEW)

A component for rendering **multiple VRM avatars** in a single scene with independent state management.

**Features:**
- ✅ Render 2+ VRM avatars simultaneously
- ✅ Independent state per avatar (position, rotation, gaze)
- ✅ Automatic face-to-face positioning
- ✅ Per-avatar expression and animation control
- ✅ No dependency on global `useModelStore`

**Usage:**
```vue
<script setup lang="ts">
import { MultiAvatarScene } from '@proj-airi/stage-ui-three'

const avatarConfigs = [
  {
    modelSrc: '/models/avatar1.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: -0.6, y: 0, z: 0 },
  },
  {
    modelSrc: '/models/avatar2.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: 0.6, y: 0, z: 0 },
  },
]
</script>

<template>
  <MultiAvatarScene
    :avatar-configs="avatarConfigs"
    env-select="hemisphere"
  />
</template>
```

**See also:**
- [Full Documentation](./docs/MultiAvatarScene.md)
- [Quick Start Guide](./docs/MultiAvatarScene-QuickStart.md)
- [Example Implementation](./examples/MultiAvatarConversation.vue)

## Sub-components

### VRMModel

Core component for loading and displaying VRM models. Handles:
- Model loading with progress tracking
- Shader injection and rendering settings
- Animation loading and playback
- Expression control
- Eye tracking (camera, mouse, or manual)

### OrbitControls

Camera orbit controls extending Three.js OrbitControls for intuitive navigation.

### SkyBox

HDRI-based skybox environment with IBL (Image-Based Lighting) support.

## Composables

### VRM Composables (`@proj-airi/stage-ui-three/composables/vrm`)

- `loadVrm()` - Load and initialize VRM models
- `useVRMLoader()` - Singleton GLTFLoader with VRM plugins
- `useVRMCore()` - Core VRM functionality
- `useVRMExpression()` - Expression/blend shape control
- `useVRMAnimation()` - Animation handling
- `useVRMLipSync()` - Lip-sync integration

## Assets

### Default Animations (`@proj-airi/stage-ui-three/assets/vrm`)

- `idle_loop.vrma` - Default idle animation

## Installation

```bash
pnpm add @proj-airi/stage-ui-three
```

## Dependencies

- Vue 3
- Three.js
- TresJS (Vue renderer for Three.js)
- @pixiv/three-vrm (VRM model support)
- Pinia (state management for ThreeScene)

## TypeScript Support

All components are written in TypeScript with full type definitions.

## Examples

- [Multi-Avatar Conversation Example](./examples/MultiAvatarConversation.vue) - Demonstrates scripted interactions between two avatars

## Documentation

- [MultiAvatarScene Documentation](./docs/MultiAvatarScene.md) - Complete API reference
- [MultiAvatarScene Quick Start](./docs/MultiAvatarScene-QuickStart.md) - Getting started guide

## License

MIT
