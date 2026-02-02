<script setup lang="ts">
/**
 * MultiAvatarScene - A component for rendering multiple VRM avatars in a single 3D scene
 * 
 * This component demonstrates how to:
 * - Set up a shared 3D scene with TresCanvas, camera, and lighting
 * - Manage multiple VRMModel instances with independent state
 * - Make avatars look at each other by updating their lookAt targets
 * - Control individual avatar expressions and animations
 * 
 * Unlike ThreeScene, this component does NOT use the global model store (useModelStore).
 * Each avatar has its own reactive state for position, rotation, and gaze.
 */

import type { PerspectiveCamera } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import type { TresContext } from '@tresjs/core'

import { Screen } from '@proj-airi/ui'
import { TresCanvas } from '@tresjs/core'
import { useElementBounding } from '@vueuse/core'
import { formatHex } from 'culori'
import {
  ACESFilmicToneMapping,
  PerspectiveCamera as ThreePerspectiveCamera,
} from 'three'
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'

import { VRMModel } from './Model'
import { OrbitControls } from './Controls'
import { SkyBox } from './Environment'

// Type for 3D vector
interface Vec3 {
  x: number
  y: number
  z: number
}

// Type for individual avatar data
interface AvatarData {
  modelSrc: string
  idleAnimation: string
  offset: Vec3
  rotationY: number
  lookAt: Vec3
  eyeHeight: number
  origin: Vec3
  modelRef: InstanceType<typeof VRMModel> | null
}

const props = withDefaults(defineProps<{
  // Array of model sources and idle animations for each avatar
  // If not provided, will use default example paths (which may not exist)
  avatarConfigs?: Array<{
    modelSrc: string
    idleAnimation: string
    offset?: Vec3
  }>
  // Environment settings
  envSelect?: 'skyBox' | 'hemisphere'
  skyBoxSrc?: string
  skyBoxIntensity?: number
  // Whether to show debug axes
  showAxes?: boolean
}>(), {
  envSelect: 'hemisphere',
  skyBoxIntensity: 1.0,
  showAxes: false,
})

const emit = defineEmits<{
  (e: 'error', value: unknown): void
  (e: 'ready'): void
}>()

// Scene container and sizing
const sceneContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(sceneContainerRef)

// Shared camera and controls
const camera = shallowRef<PerspectiveCamera>(new ThreePerspectiveCamera())
const cameraPosition = reactive<Vec3>({ x: 0, y: 1.5, z: 3 })
const cameraTarget = reactive<Vec3>({ x: 0, y: 1, z: 0 })
const cameraFOV = ref(30)
const cameraDistance = ref(3)

const tresCanvasRef = shallowRef<TresContext>()
const skyBoxEnvRef = ref<InstanceType<typeof SkyBox>>()

// Lighting configuration (shared by all avatars)
const ambientLightColor = ref('#FFFFFF')
const ambientLightIntensity = ref(0.3)
const hemisphereSkyColor = ref('#87CEEB')
const hemisphereGroundColor = ref('#654321')
const hemisphereLightIntensity = ref(0.6)
const directionalLightColor = ref('#FFFFFF')
const directionalLightIntensity = ref(1.0)
const directionalLightPosition = reactive<Vec3>({ x: 1, y: 2, z: 1 })

// Avatar data
const avatars = reactive<AvatarData[]>([])

// Initialize avatars from props or use defaults
onMounted(() => {
  if (props.avatarConfigs && props.avatarConfigs.length > 0) {
    // Use provided configurations
    props.avatarConfigs.forEach((config, idx) => {
      avatars.push({
        modelSrc: config.modelSrc,
        idleAnimation: config.idleAnimation,
        offset: config.offset || { x: idx === 0 ? -0.5 : 0.5, y: 0, z: 0 },
        rotationY: 0,
        lookAt: { x: 0, y: 1, z: 0 },
        eyeHeight: 0,
        origin: { x: 0, y: 0, z: 0 },
        modelRef: null,
      })
    })
  } else {
    // Create default avatar configuration (may need valid model paths)
    // Note: These are placeholder paths - users should provide actual VRM files
    const defaultIdleAnimation = new URL('../assets/vrm/animations/idle_loop.vrma', import.meta.url).href
    
    avatars.push(
      {
        modelSrc: '', // Empty path - user must provide
        idleAnimation: defaultIdleAnimation,
        offset: { x: -0.5, y: 0, z: 0 },
        rotationY: 0,
        lookAt: { x: 0, y: 1, z: 0 },
        eyeHeight: 0,
        origin: { x: 0, y: 0, z: 0 },
        modelRef: null,
      },
      {
        modelSrc: '', // Empty path - user must provide
        idleAnimation: defaultIdleAnimation,
        offset: { x: 0.5, y: 0, z: 0 },
        rotationY: 0,
        lookAt: { x: 0, y: 1, z: 0 },
        eyeHeight: 0,
        origin: { x: 0, y: 0, z: 0 },
        modelRef: null,
      },
    )
  }
  
  if (props.envSelect === 'skyBox' && props.skyBoxSrc) {
    skyBoxEnvRef.value?.reload(props.skyBoxSrc)
  }
})

// Helper to update lookAt targets so avatars face each other
function tryUpdateLookTargets() {
  // Only update once all avatars have reported their positions
  const allLoaded = avatars.every(avatar => avatar.eyeHeight > 0)
  if (!allLoaded) return

  // Make each avatar look at the next one (or wrap around)
  avatars.forEach((avatar, idx) => {
    const targetIdx = (idx + 1) % avatars.length
    const target = avatars[targetIdx]
    
    avatar.lookAt.x = target.origin.x + target.offset.x
    avatar.lookAt.y = target.eyeHeight
    avatar.lookAt.z = target.origin.z + target.offset.z
  })
}

// Event handlers for avatar model loading
function onAvatarModelOrigin(avatar: AvatarData, value: Vec3) {
  avatar.origin.x = value.x
  avatar.origin.y = value.y
  avatar.origin.z = value.z
  tryUpdateLookTargets()
}

function onAvatarEyeHeight(avatar: AvatarData, value: number) {
  avatar.eyeHeight = value
  tryUpdateLookTargets()
}

// OrbitControls event handlers
function onOrbitControlsCameraChanged(value: {
  newCameraPosition: Vec3
  newCameraDistance: number
}) {
  cameraPosition.x = value.newCameraPosition.x
  cameraPosition.y = value.newCameraPosition.y
  cameraPosition.z = value.newCameraPosition.z
  cameraDistance.value = value.newCameraDistance
}

const controlsReady = ref(false)
function onOrbitControlsReady() {
  controlsReady.value = true
}

// Tres Canvas ready
function onTresReady(context: TresContext) {
  tresCanvasRef.value = context
}

// Model size tracking (used for controls)
const modelSize = reactive<Vec3>({ x: 1, y: 2, z: 1 })
const modelLoaded = ref(false)
const controlEnable = ref(true)

function onAvatarLoaded() {
  modelLoaded.value = true
  // Check if all avatars are loaded
  const allLoaded = avatars.every(avatar => avatar.modelRef !== null)
  if (allLoaded) {
    emit('ready')
  }
}

// Expose methods to control individual avatars
defineExpose({
  /**
   * Set an expression on a specific avatar
   * @param avatarIndex - Index of the avatar (0-based)
   * @param expression - Expression name (e.g., 'happy', 'angry', 'sad')
   * @param intensity - Expression intensity (0-1)
   */
  setExpression(avatarIndex: number, expression: string, intensity = 1) {
    if (avatarIndex >= 0 && avatarIndex < avatars.length) {
      const avatar = avatars[avatarIndex]
      if (avatar.modelRef) {
        avatar.modelRef.setExpression(expression, intensity)
      }
    }
  },
  
  /**
   * Set a frame hook for a specific avatar
   * @param avatarIndex - Index of the avatar (0-based)
   * @param hook - Function called each frame with (vrm, delta)
   */
  setVrmFrameHook(avatarIndex: number, hook?: (vrm: VRM, delta: number) => void) {
    if (avatarIndex >= 0 && avatarIndex < avatars.length) {
      const avatar = avatars[avatarIndex]
      if (avatar.modelRef) {
        avatar.modelRef.setVrmFrameHook(hook)
      }
    }
  },
  
  /**
   * Update the lookAt target for a specific avatar
   * @param avatarIndex - Index of the avatar (0-based)
   * @param target - 3D position to look at
   */
  lookAtUpdate(avatarIndex: number, target: Vec3) {
    if (avatarIndex >= 0 && avatarIndex < avatars.length) {
      const avatar = avatars[avatarIndex]
      if (avatar.modelRef) {
        avatar.modelRef.lookAtUpdate(target)
      }
    }
  },
  
  /**
   * Get the camera instance
   */
  camera: () => camera.value,
  
  /**
   * Get the renderer instance
   */
  renderer: () => tresCanvasRef.value?.renderer.instance,
  
  /**
   * Get array of avatar data (for inspecting positions, etc.)
   */
  avatars: computed(() => avatars),
})
</script>

<template>
  <Screen>
    <div ref="sceneContainerRef" :class="['h-full','w-full']">
      <TresCanvas
        v-show="true"
        :camera="camera"
        :antialias="true"
        :width="width"
        :height="height"
        :tone-mapping="ACESFilmicToneMapping"
        :tone-mapping-exposure="1"
        :clear-alpha="0"
        @ready="onTresReady"
      >
        <!-- Orbit controls for camera movement -->
        <OrbitControls
          :control-enable="controlEnable"
          :model-loaded="modelLoaded"
          :model-size="modelSize"
          :camera-position="cameraPosition"
          :camera-target="cameraTarget"
          :camera-f-o-v="cameraFOV"
          :camera-distance="cameraDistance"
          @orbit-controls-camera-changed="onOrbitControlsCameraChanged"
          @orbit-controls-ready="onOrbitControlsReady"
        />

        <!-- Environment: SkyBox or Hemisphere Light -->
        <SkyBox
          v-if="envSelect === 'skyBox'"
          ref="skyBoxEnvRef"
          :sky-box-src="skyBoxSrc || ''"
          :as-background="true"
        />
        <TresHemisphereLight
          v-else
          :color="formatHex(hemisphereSkyColor)"
          :ground-color="formatHex(hemisphereGroundColor)"
          :position="[0, 1, 0]"
          :intensity="hemisphereLightIntensity"
          cast-shadow
        />

        <!-- Ambient and directional lighting -->
        <TresAmbientLight
          :color="formatHex(ambientLightColor)"
          :intensity="ambientLightIntensity"
          cast-shadow
        />
        <TresDirectionalLight
          :color="formatHex(directionalLightColor)"
          :position="[directionalLightPosition.x, directionalLightPosition.y, directionalLightPosition.z]"
          :intensity="directionalLightIntensity"
          cast-shadow
        />

        <!-- Render each avatar -->
        <VRMModel
          v-for="(avatar, idx) in avatars"
          :key="idx"
          :ref="(el: any) => { avatar.modelRef = el }"
          :model-src="avatar.modelSrc"
          :idle-animation="avatar.idleAnimation"
          :model-offset="avatar.offset"
          :model-rotation-y="avatar.rotationY"
          :look-at-target="avatar.lookAt"
          :tracking-mode="'none'"
          :eye-height="avatar.eyeHeight"
          :camera="camera"
          :camera-position="cameraPosition"
          :env-select="envSelect"
          :sky-box-intensity="skyBoxIntensity"
          @model-origin="(val: Vec3) => onAvatarModelOrigin(avatar, val)"
          @eye-height="(val: number) => onAvatarEyeHeight(avatar, val)"
          @loaded="onAvatarLoaded"
          @error="(err: unknown) => emit('error', err)"
        />

        <!-- Optional debug axes -->
        <TresAxesHelper v-if="showAxes" :size="1" />
      </TresCanvas>
    </div>
  </Screen>
</template>
