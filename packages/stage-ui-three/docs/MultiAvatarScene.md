# MultiAvatarScene Component

A Vue component for rendering multiple VRM avatars in a single 3D scene with independent state management.

## Overview

`MultiAvatarScene` demonstrates how to instantiate multiple `VRMModel` components within a shared 3D environment. Unlike `ThreeScene`, which uses a global Pinia store (`useModelStore`) designed for a single model, `MultiAvatarScene` manages each avatar's state independently through reactive objects.

## Features

- ✅ **Multiple avatars in one scene** - Render 2 or more VRM avatars simultaneously
- ✅ **Independent state** - Each avatar has its own position, rotation, and gaze target
- ✅ **Automatic face-to-face positioning** - Avatars look at each other by default
- ✅ **Shared lighting and camera** - Efficient scene setup with one camera and lighting rig
- ✅ **Programmable interactions** - Control expressions, animations, and gaze per avatar
- ✅ **No global state** - Does not use `useModelStore`, making it easier to compose

## Basic Usage

```vue
<script setup lang="ts">
import { MultiAvatarScene } from '@proj-airi/stage-ui-three'
import { ref } from 'vue'

const sceneRef = ref<InstanceType<typeof MultiAvatarScene>>()

// Define avatar configurations
const avatarConfigs = [
  {
    modelSrc: '/path/to/avatar1.vrm',
    idleAnimation: '/path/to/idle.vrma',
    offset: { x: -0.5, y: 0, z: 0 }, // Position left
  },
  {
    modelSrc: '/path/to/avatar2.vrm',
    idleAnimation: '/path/to/idle.vrma',
    offset: { x: 0.5, y: 0, z: 0 }, // Position right
  },
]

function makeAvatarSmile(avatarIndex: number) {
  // Set 'happy' expression on avatar at index
  sceneRef.value?.setExpression(avatarIndex, 'happy', 1.0)
}
</script>

<template>
  <MultiAvatarScene
    ref="sceneRef"
    :avatar-configs="avatarConfigs"
    env-select="hemisphere"
    @ready="() => console.log('Scene ready!')"
    @error="(err) => console.error('Scene error:', err)"
  />
</template>
```

## Props

### `avatarConfigs`

An array of avatar configuration objects. Each object specifies:

- `modelSrc` (string, required): Path to the VRM model file
- `idleAnimation` (string, required): Path to the VRMA animation file
- `offset` (Vec3, optional): 3D position offset `{ x, y, z }`. Defaults to `{ x: idx === 0 ? -0.5 : 0.5, y: 0, z: 0 }`

**Example:**

```ts
const avatarConfigs = [
  {
    modelSrc: '/models/character1.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: -1, y: 0, z: 0 },
  },
  {
    modelSrc: '/models/character2.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: 1, y: 0, z: 0 },
  },
]
```

### `envSelect`

- Type: `'skyBox' | 'hemisphere'`
- Default: `'hemisphere'`

Choose between a skybox environment or hemisphere lighting.

### `skyBoxSrc`

- Type: `string`
- Default: `undefined`

Path to the HDRI skybox image (only used when `envSelect="skyBox"`).

### `skyBoxIntensity`

- Type: `number`
- Default: `1.0`

Intensity of the skybox environment lighting.

### `showAxes`

- Type: `boolean`
- Default: `false`

Show debug axes in the 3D scene.

## Events

### `@ready`

Emitted when all avatars have loaded successfully.

### `@error`

Emitted when an error occurs during model loading or rendering.

**Example:**

```vue
<MultiAvatarScene
  @ready="onSceneReady"
  @error="onSceneError"
/>
```

## Exposed Methods

The component exposes several methods via `ref` for programmatic control:

### `setExpression(avatarIndex, expression, intensity)`

Set a facial expression on a specific avatar.

- `avatarIndex` (number): Zero-based index of the avatar
- `expression` (string): Expression name (e.g., `'happy'`, `'angry'`, `'sad'`, `'surprised'`)
- `intensity` (number, optional): Expression intensity from 0 to 1. Default: `1`

**Example:**

```ts
sceneRef.value?.setExpression(0, 'happy', 0.8)
```

### `setVrmFrameHook(avatarIndex, hook)`

Set a frame update hook for a specific avatar. The hook function is called every frame with the VRM instance and delta time.

- `avatarIndex` (number): Zero-based index of the avatar
- `hook` (function, optional): `(vrm: VRM, delta: number) => void`

**Example:**

```ts
sceneRef.value?.setVrmFrameHook(0, (vrm, delta) => {
  // Custom animation logic
  console.log('Frame update:', delta)
})
```

### `lookAtUpdate(avatarIndex, target)`

Programmatically update the gaze target for a specific avatar.

- `avatarIndex` (number): Zero-based index of the avatar
- `target` (Vec3): 3D position to look at `{ x, y, z }`

**Example:**

```ts
sceneRef.value?.lookAtUpdate(0, { x: 1, y: 1.5, z: 0 })
```

### `camera()`

Returns the shared `PerspectiveCamera` instance.

### `renderer()`

Returns the WebGL renderer instance.

### `avatars`

Returns a computed ref to the array of avatar data, useful for inspecting positions and state.

## How It Works

### 1. Scene Setup

The component creates a `TresCanvas` with:

- A shared `PerspectiveCamera`
- `OrbitControls` for camera navigation
- Lighting (ambient, directional, and hemisphere/skybox)
- Post-processing effects (ACES tone mapping)

### 2. Per-Avatar State

Each avatar maintains its own reactive state:

```ts
interface AvatarData {
  modelSrc: string         // VRM file path
  idleAnimation: string    // VRMA animation path
  offset: Vec3             // Position offset
  rotationY: number        // Y-axis rotation
  lookAt: Vec3             // Gaze target
  eyeHeight: number        // Eye height (from VRM)
  origin: Vec3             // Model origin (from VRM)
  modelRef: VRMModel | null // Ref to VRMModel instance
}
```

### 3. Event Handling

When each `VRMModel` loads, it emits:

- `model-origin` - The model's center position
- `eye-height` - The Y-coordinate of the avatar's eyes

These events trigger the `tryUpdateLookTargets()` helper, which:

1. Waits until all avatars have reported their positions
2. Updates each avatar's `lookAt` target to point at the next avatar
3. Creates a "facing each other" arrangement

### 4. Rendering Loop

The template uses `v-for` to render each avatar:

```vue
<VRMModel
  v-for="(avatar, idx) in avatars"
  :key="idx"
  :ref="(el) => { avatar.modelRef = el }"
  :model-src="avatar.modelSrc"
  :idle-animation="avatar.idleAnimation"
  :model-offset="avatar.offset"
  :model-rotation-y="avatar.rotationY"
  :look-at-target="avatar.lookAt"
  :tracking-mode="'none'"
  ...
/>
```

## Advanced Example: Scripted Interaction

```vue
<script setup lang="ts">
import { MultiAvatarScene } from '@proj-airi/stage-ui-three'
import { ref, onMounted } from 'vue'

const sceneRef = ref<InstanceType<typeof MultiAvatarScene>>()

const avatarConfigs = [
  {
    modelSrc: '/models/speaker.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: -0.5, y: 0, z: 0 },
  },
  {
    modelSrc: '/models/listener.vrm',
    idleAnimation: '/animations/idle.vrma',
    offset: { x: 0.5, y: 0, z: 0 },
  },
]

async function runConversation() {
  // Avatar 0 speaks
  sceneRef.value?.setExpression(0, 'happy', 1)
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Avatar 1 responds
  sceneRef.value?.setExpression(1, 'surprised', 0.7)
  sceneRef.value?.setExpression(0, 'neutral', 1)
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Both smile
  sceneRef.value?.setExpression(0, 'happy', 0.5)
  sceneRef.value?.setExpression(1, 'happy', 0.5)
}

onMounted(() => {
  // Start conversation after scene loads
  setTimeout(runConversation, 1000)
})
</script>

<template>
  <MultiAvatarScene
    ref="sceneRef"
    :avatar-configs="avatarConfigs"
    env-select="skyBox"
    sky-box-src="/hdri/studio.hdr"
  />
</template>
```

## Tips

1. **Model paths**: Ensure VRM and VRMA files are accessible from your app's public directory or via URL
2. **Performance**: Each avatar adds rendering overhead. Test with 2-4 avatars for best performance
3. **Positioning**: Adjust `offset` values to control spacing. Negative X = left, positive X = right
4. **Tracking mode**: Always set to `'none'` to manually control gaze via `lookAt`
5. **Expressions**: Available expressions depend on the VRM model's blend shapes

## Differences from ThreeScene

| Feature | ThreeScene | MultiAvatarScene |
|---------|-----------|------------------|
| **State management** | Uses Pinia `useModelStore` | Independent reactive state per avatar |
| **Number of avatars** | One | Multiple (2+) |
| **Per-avatar control** | N/A | `setExpression(index, ...)`, `lookAtUpdate(index, ...)` |
| **Use case** | Single character viewer | Multi-character scenes, conversations |

## See Also

- [VRMModel Component](../components/Model/VRMModel.vue)
- [ThreeScene Component](../components/ThreeScene.vue)
- [VRM Composables](../composables/vrm/)
