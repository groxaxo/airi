<script setup lang="ts">
import type { DualConversationSide } from '../../services/dual-conversation-runtime'

import { ThreeScene } from '@proj-airi/stage-ui-three'
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'

export interface DualStageSlot {
  audioSource?: AudioBufferSourceNode
  modelSrc?: string
  name: string
  side: DualConversationSide
}

const props = withDefaults(defineProps<{
  activeSide?: DualConversationSide
  enableOrbitControls?: boolean
  paused?: boolean
  slots: readonly [DualStageSlot, DualStageSlot]
}>(), {
  enableOrbitControls: true,
  paused: false,
})

const sceneStates = reactive<Record<DualConversationSide, 'pending' | 'loading' | 'mounted'>>({
  left: 'pending',
  right: 'pending',
})
const sceneErrors = reactive<Record<DualConversationSide, boolean>>({
  left: false,
  right: false,
})
const { t } = useI18n()
</script>

<template>
  <div
    data-dual-stage
    :class="[
      'grid grid-cols-2',
      'h-full w-full min-w-[44rem]',
      'overflow-hidden',
    ]"
  >
    <section
      v-for="slot in props.slots"
      :key="slot.side"
      :data-side="slot.side"
      :data-active="props.activeSide === slot.side"
      :data-scene-state="sceneStates[slot.side]"
      :class="[
        'relative min-h-0 min-w-0',
        'transition-colors duration-300',
        slot.side === 'left' && 'border-r border-white/12',
        props.activeSide === slot.side ? 'bg-primary-400/6' : 'bg-black/4',
      ]"
    >
      <ThreeScene
        v-model:state="sceneStates[slot.side]"
        :scene-id="`dual-conversation-${slot.side}`"
        model-state="isolated"
        :current-audio-source="slot.audioSource"
        :enable-orbit-controls="props.enableOrbitControls"
        :model-src="slot.modelSrc"
        :paused="props.paused"
        @error="sceneErrors[slot.side] = true"
      />
      <div
        :class="[
          'pointer-events-none absolute inset-x-0 bottom-0',
          'h-32 bg-gradient-to-t from-black/60 to-transparent',
        ]"
      />
      <div
        :class="[
          'pointer-events-none absolute inset-x-0 bottom-0',
          'flex items-center justify-between gap-3 px-5 pb-4',
        ]"
      >
        <span :class="['truncate text-lg text-white font-600', 'drop-shadow-md']">
          {{ slot.name }}
        </span>
        <span
          v-if="props.activeSide === slot.side"
          :class="[
            'rounded-full px-2.5 py-1',
            'bg-primary-400/85 text-xs text-white font-600',
            'shadow-sm backdrop-blur-md',
          ]"
        >
          {{ t('stage.dual-conversation.status.live') }}
        </span>
      </div>
      <div
        v-if="sceneErrors[slot.side]"
        :class="[
          'absolute inset-x-4 top-4',
          'rounded-xl bg-red-950/80 p-3',
          'text-sm text-red-100 backdrop-blur-md',
        ]"
      >
        {{ t('stage.dual-conversation.errors.render-vrm') }}
      </div>
    </section>
  </div>
</template>
