<script setup lang="ts">
/**
 * Example: Multi-Avatar Conversation Scene
 * 
 * This example demonstrates:
 * - Setting up two avatars in a scene
 * - Making them face each other
 * - Scripting a simple conversation with expressions
 * - Using the exposed methods to control avatars
 */

import { MultiAvatarScene } from '@proj-airi/stage-ui-three'
import { ref, onMounted } from 'vue'

const sceneRef = ref<InstanceType<typeof MultiAvatarScene>>()
const sceneReady = ref(false)
const conversationLog = ref<string[]>([])

// Configure two avatars - IMPORTANT: Replace empty modelSrc with actual VRM file paths
// Example: modelSrc: '/models/avatar1.vrm' or use a URL to a VRM file
const avatarConfigs = [
  {
    modelSrc: '', // TODO: Replace with actual VRM file path (e.g., '/models/speaker.vrm')
    idleAnimation: new URL('@proj-airi/stage-ui-three/assets/vrm/animations/idle_loop.vrma', import.meta.url).href,
    offset: { x: -0.6, y: 0, z: 0 }, // Position left
  },
  {
    modelSrc: '', // TODO: Replace with actual VRM file path (e.g., '/models/listener.vrm')
    idleAnimation: new URL('@proj-airi/stage-ui-three/assets/vrm/animations/idle_loop.vrma', import.meta.url).href,
    offset: { x: 0.6, y: 0, z: 0 }, // Position right
  },
]

// Log conversation actions
function log(message: string) {
  conversationLog.value.push(`[${new Date().toLocaleTimeString()}] ${message}`)
}

// Helper to wait
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run a scripted conversation
async function runConversation() {
  if (!sceneRef.value || !sceneReady.value) {
    log('Scene not ready yet')
    return
  }

  log('Starting conversation...')

  // Avatar 0 (left) greets happily
  log('Avatar 0: *smiles* Hello!')
  sceneRef.value.setExpression(0, 'happy', 1.0)
  await sleep(2000)

  // Reset to neutral
  sceneRef.value.setExpression(0, 'neutral', 1.0)
  await sleep(500)

  // Avatar 1 (right) responds with surprise
  log('Avatar 1: *surprised* Oh, hi there!')
  sceneRef.value.setExpression(1, 'surprised', 0.8)
  await sleep(2000)

  // Avatar 1 becomes happy
  sceneRef.value.setExpression(1, 'happy', 0.7)
  await sleep(1000)

  // Both avatars smile
  log('Both avatars smile at each other')
  sceneRef.value.setExpression(0, 'happy', 0.6)
  sceneRef.value.setExpression(1, 'happy', 0.6)
  await sleep(2000)

  // Reset expressions
  log('Conversation ends')
  sceneRef.value.setExpression(0, 'neutral', 1.0)
  sceneRef.value.setExpression(1, 'neutral', 1.0)
}

// Manual expression controls
function setAvatarExpression(avatarIndex: number, expression: string, intensity: number) {
  if (!sceneRef.value) return
  sceneRef.value.setExpression(avatarIndex, expression, intensity)
  log(`Avatar ${avatarIndex}: set expression '${expression}' (${intensity})`)
}

// Handle scene ready
function onSceneReady() {
  sceneReady.value = true
  log('Scene loaded successfully!')
  log('Click "Run Conversation" to see a scripted interaction')
}

// Handle errors
function onSceneError(error: unknown) {
  log(`ERROR: ${error}`)
  console.error('Scene error:', error)
}

// Optional: Auto-start conversation on mount
onMounted(async () => {
  // Wait a bit for the scene to fully initialize
  await sleep(1000)
  
  // Uncomment to auto-run conversation:
  // if (sceneReady.value) {
  //   await runConversation()
  // }
})
</script>

<template>
  <div :class="['h-screen','w-screen','flex','flex-col']">
    <!-- Control Panel -->
    <div :class="['bg-gray-100','dark:bg-gray-800','p-4','border-b','border-gray-300','dark:border-gray-700']">
      <h1 :class="['text-2xl','font-bold','mb-2']">
        Multi-Avatar Scene Example
      </h1>
      
      <div :class="['flex','gap-2','mb-4']">
        <button
          :class="[
            'px-4','py-2','bg-blue-500','text-white','rounded','hover:bg-blue-600',
            'disabled:opacity-50','disabled:cursor-not-allowed'
          ]"
          :disabled="!sceneReady"
          @click="runConversation"
        >
          Run Conversation
        </button>
        
        <button
          :class="[
            'px-4','py-2','bg-green-500','text-white','rounded','hover:bg-green-600',
            'disabled:opacity-50','disabled:cursor-not-allowed'
          ]"
          :disabled="!sceneReady"
          @click="setAvatarExpression(0, 'happy', 1.0)"
        >
          Avatar 0: Happy
        </button>
        
        <button
          :class="[
            'px-4','py-2','bg-green-500','text-white','rounded','hover:bg-green-600',
            'disabled:opacity-50','disabled:cursor-not-allowed'
          ]"
          :disabled="!sceneReady"
          @click="setAvatarExpression(1, 'happy', 1.0)"
        >
          Avatar 1: Happy
        </button>
        
        <button
          :class="[
            'px-4','py-2','bg-yellow-500','text-white','rounded','hover:bg-yellow-600',
            'disabled:opacity-50','disabled:cursor-not-allowed'
          ]"
          :disabled="!sceneReady"
          @click="setAvatarExpression(0, 'surprised', 0.8)"
        >
          Avatar 0: Surprised
        </button>
        
        <button
          :class="[
            'px-4','py-2','bg-yellow-500','text-white','rounded','hover:bg-yellow-600',
            'disabled:opacity-50','disabled:cursor-not-allowed'
          ]"
          :disabled="!sceneReady"
          @click="setAvatarExpression(1, 'surprised', 0.8)"
        >
          Avatar 1: Surprised
        </button>
      </div>
      
      <!-- Log -->
      <div :class="['bg-white','dark:bg-gray-900','rounded','p-2','h-24','overflow-y-auto','text-sm','font-mono']">
        <div v-for="(msg, idx) in conversationLog" :key="idx">
          {{ msg }}
        </div>
        <div v-if="conversationLog.length === 0" :class="['text-gray-400']">
          Waiting for scene to load...
        </div>
      </div>
    </div>

    <!-- 3D Scene -->
    <div :class="['flex-1','relative']">
      <MultiAvatarScene
        ref="sceneRef"
        :avatar-configs="avatarConfigs"
        env-select="hemisphere"
        :show-axes="false"
        @ready="onSceneReady"
        @error="onSceneError"
      />
      
      <!-- Status overlay -->
      <div
        v-if="!sceneReady"
        :class="[
          'absolute','inset-0','flex','items-center','justify-center',
          'bg-black','bg-opacity-50','text-white','text-xl'
        ]"
      >
        Loading scene...
      </div>
    </div>
    
    <!-- Instructions -->
    <div :class="['bg-gray-100','dark:bg-gray-800','p-4','border-t','border-gray-300','dark:border-gray-700','text-sm']">
      <strong>Instructions:</strong>
      <ul :class="['list-disc','ml-5','mt-2']">
        <li>Update the <code>modelSrc</code> paths in the code to point to your actual VRM files</li>
        <li>Use orbit controls (drag to rotate, scroll to zoom) to view the avatars</li>
        <li>Click "Run Conversation" to see a scripted interaction</li>
        <li>Use the expression buttons to manually control individual avatars</li>
        <li>Check the console for detailed logs</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
code {
  background-color: rgba(0, 0, 0, 0.1);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
}
</style>
