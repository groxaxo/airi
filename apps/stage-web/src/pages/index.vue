<script setup lang="ts">
import type { DualConversationSide } from '@proj-airi/stage-ui/services/dual-conversation-runtime'

import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import MobileHeader from '@proj-airi/stage-layouts/components/Layouts/MobileHeader.vue'

import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { DualStage } from '@proj-airi/stage-ui/components/scenes'
import { useDualConversationStore } from '@proj-airi/stage-ui/stores/dual-conversation'
import { Button, Callout, FieldCombobox, FieldInput, FieldTextArea } from '@proj-airi/ui'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const configOpen = ref(false)
const isStarting = ref(false)
const startError = ref(false)
const transcriptRef = useTemplateRef<HTMLElement>('transcript')

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const backgroundStore = useBackgroundStore()
const { selectedOption, sampledColor } = storeToRefs(backgroundStore)
const backgroundSurface = useTemplateRef<InstanceType<typeof BackgroundProvider>>('backgroundSurface')
const { syncBackgroundTheme } = useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor })

const dualConversationStore = useDualConversationStore()
const {
  catalogErrors,
  catalogLoading,
  characterOptions,
  chatModels,
  chatProviderOptions,
  configuration,
  configurationError,
  conversation,
  initializationError,
  isRunning,
  leftAudioSource,
  leftModelSrc,
  rightAudioSource,
  rightModelSrc,
  seed,
  speechModels,
  speechProviderOptions,
  speechVoices,
  turnLimit,
  vrmOptions,
} = storeToRefs(dualConversationStore)

const needsProviderSetup = computed(() =>
  chatProviderOptions.value.length < 2 || speechProviderOptions.value.length < 2,
)

const activeName = computed(() => {
  const side = conversation.value.activeSide
  return side ? configuration.value[side].name : ''
})

const stageSlots = computed(() => [{
  audioSource: leftAudioSource.value,
  modelSrc: leftModelSrc.value,
  name: configuration.value.left.name,
  side: 'left' as const,
}, {
  audioSource: rightAudioSource.value,
  modelSrc: rightModelSrc.value,
  name: configuration.value.right.name,
  side: 'right' as const,
}] as const)

const visibleError = computed(() => {
  if (startError.value)
    return t('stage.dual-conversation.errors.start')
  if (conversation.value.errorCode)
    return t(`stage.dual-conversation.errors.${conversation.value.errorCode}`)
  if (initializationError.value)
    return t(`stage.dual-conversation.errors.${initializationError.value}`)
  if (configurationError.value)
    return t(`stage.dual-conversation.errors.${configurationError.value}`)
  return undefined
})

const statusLabel = computed(() => {
  switch (conversation.value.phase) {
    case 'generating':
      return t('stage.dual-conversation.status.generating', { name: activeName.value })
    case 'speaking':
      return t('stage.dual-conversation.status.speaking', { name: activeName.value })
    case 'completed':
      return t('stage.dual-conversation.status.completed')
    case 'stopped':
      return t('stage.dual-conversation.status.stopped')
    case 'failed':
      return t('stage.dual-conversation.status.failed')
    default:
      return t('stage.dual-conversation.status.idle')
  }
})

const canStart = computed(() =>
  !isStarting.value
  && !isRunning.value
  && !configurationError.value
  && seed.value.trim().length > 0,
)

function modelOptions(side: DualConversationSide, kind: 'chat' | 'speech') {
  const models = kind === 'chat' ? chatModels.value[side] : speechModels.value[side]
  return models.map(model => ({ label: model.name, value: model.id }))
}

function voiceOptions(side: DualConversationSide) {
  return speechVoices.value[side].map(voice => ({ label: voice.name, value: voice.id }))
}

function providerOptions(kind: 'chat' | 'speech') {
  const providers = kind === 'chat' ? chatProviderOptions.value : speechProviderOptions.value
  return providers.map(provider => ({ label: provider.label, value: provider.id }))
}

async function startConversation() {
  startError.value = false
  isStarting.value = true
  configOpen.value = false

  try {
    await dualConversationStore.start()
  }
  catch {
    startError.value = true
  }
  finally {
    isStarting.value = false
  }
}

function stopConversation() {
  isStarting.value = false
  dualConversationStore.stop()
}

function openProviderSettings() {
  configOpen.value = false
  void router.push('/settings/providers/')
}

function onCharacterSelected(side: DualConversationSide, cardId: string | undefined) {
  if (cardId)
    void dualConversationStore.selectCharacter(side, cardId)
}

function onModelSelected(side: DualConversationSide, modelId: string | undefined) {
  if (!modelId)
    return
  configuration.value[side].displayModelId = modelId
  void dualConversationStore.refreshModelSource(side)
}

watch([
  () => configuration.value.left.chatProviderId,
  () => configuration.value.left.speechProviderId,
], () => void dualConversationStore.refreshSlotCatalog('left'))

watch([
  () => configuration.value.right.chatProviderId,
  () => configuration.value.right.speechProviderId,
], () => void dualConversationStore.refreshSlotCatalog('right'))

watch(() => configuration.value.left.speechModel, () => void dualConversationStore.refreshSpeechVoices('left'))
watch(() => configuration.value.right.speechModel, () => void dualConversationStore.refreshSpeechVoices('right'))

watch(() => [
  conversation.value.phase,
  ...conversation.value.turns.map(turn => `${turn.id}:${turn.status}:${turn.text}`),
], async () => {
  if (isRunning.value)
    isStarting.value = false
  await nextTick()
  transcriptRef.value?.scrollTo({ top: transcriptRef.value.scrollHeight, behavior: 'smooth' })
})

onMounted(async () => {
  syncBackgroundTheme()
  await dualConversationStore.initialize()
  if (configurationError.value)
    configOpen.value = true
})

onUnmounted(() => dualConversationStore.dispose())
</script>

<template>
  <BackgroundProvider
    ref="backgroundSurface"
    :class="['widgets top-widgets']"
    :background="selectedOption"
    :top-color="sampledColor"
  >
    <div :class="['relative z-2', 'h-100dvh w-100vw', 'flex flex-col overflow-hidden']">
      <div :class="['w-full px-0 py-1 md:px-3 md:py-3', 'flex items-center gap-2']">
        <Header :class="['hidden md:flex']" />
        <MobileHeader :class="['flex md:hidden']" />
      </div>

      <main :class="['min-h-0 flex-1', 'flex flex-col gap-2 px-2 pb-2 md:px-3 md:pb-3']">
        <section
          :class="[
            'relative min-h-[20rem] flex-1',
            'overflow-x-auto overflow-y-hidden rounded-2xl',
            'border border-white/15 bg-black/12 shadow-xl backdrop-blur-sm',
          ]"
        >
          <DualStage
            :active-side="conversation.activeSide"
            :enable-orbit-controls="!isMobile"
            :paused="configOpen"
            :slots="stageSlots"
          />

          <div
            :class="[
              'pointer-events-none absolute left-4 top-4 z-10',
              'max-w-[calc(100%-2rem)]',
            ]"
          >
            <div
              :class="[
                'rounded-xl px-3 py-2',
                'bg-black/45 text-white shadow-md backdrop-blur-md',
              ]"
            >
              <div :class="['text-sm font-650']">
                {{ t('stage.dual-conversation.title') }}
              </div>
              <div :class="['truncate text-xs text-white/70']">
                {{ statusLabel }}
              </div>
            </div>
          </div>

          <Button
            data-testid="dual-configure"
            icon="i-solar:settings-linear"
            size="sm"
            :class="['absolute right-4 top-4 z-10', 'shadow-md']"
            @click="configOpen = true"
          >
            {{ t('stage.dual-conversation.configure') }}
          </Button>
        </section>

        <section
          :class="[
            'grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_25rem]',
            'h-[19rem] min-h-0',
          ]"
        >
          <div
            :class="[
              'min-h-0 flex flex-col overflow-hidden rounded-2xl',
              'border border-white/20 bg-white/76 shadow-lg backdrop-blur-xl',
              'dark:border-white/10 dark:bg-neutral-950/72',
            ]"
          >
            <div
              :class="[
                'flex items-center justify-between gap-3 px-4 py-3',
                'border-b border-neutral-200/70',
                'dark:border-neutral-800/70',
              ]"
            >
              <h2 :class="['text-sm font-650']">
                {{ t('stage.dual-conversation.transcript.title') }}
              </h2>
              <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                {{ statusLabel }}
              </span>
            </div>
            <div
              ref="transcript"
              data-testid="dual-transcript"
              :class="['min-h-0 flex-1 overflow-y-auto', 'flex flex-col gap-3 p-4']"
            >
              <div
                v-if="conversation.seed"
                :class="[
                  'max-w-[85%] self-center rounded-xl px-3 py-2',
                  'bg-neutral-100/90 text-sm text-neutral-700',
                  'dark:bg-neutral-800/90 dark:text-neutral-200',
                ]"
              >
                <div
                  :class="[
                    'mb-1 text-[0.68rem] text-neutral-500',
                    'font-650 uppercase tracking-wide',
                    'dark:text-neutral-400',
                  ]"
                >
                  {{ t('stage.dual-conversation.transcript.first-message') }}
                </div>
                {{ conversation.seed }}
              </div>

              <div
                v-for="turn in conversation.turns"
                :key="turn.id"
                :data-side="turn.side"
                :class="[
                  'max-w-[82%] rounded-2xl px-3 py-2',
                  turn.side === 'left'
                    ? [
                      'self-start rounded-bl-sm bg-primary-100/90 text-primary-950',
                      'dark:bg-primary-900/70 dark:text-primary-100',
                    ]
                    : [
                      'self-end rounded-br-sm bg-violet-100/90 text-violet-950',
                      'dark:bg-violet-900/70 dark:text-violet-100',
                    ],
                ]"
              >
                <div :class="['mb-1 flex items-center gap-2 text-[0.7rem] font-650']">
                  <span>{{ turn.speaker }}</span>
                  <span v-if="turn.status === 'streaming'" :class="['i-svg-spinners:3-dots-fade size-3']" />
                </div>
                <p :class="['whitespace-pre-wrap text-sm leading-relaxed']">
                  {{ turn.text }}
                </p>
              </div>

              <div
                v-if="!conversation.seed && !conversation.turns.length"
                :class="[
                  'm-auto max-w-md text-center',
                  'text-sm text-neutral-500 dark:text-neutral-400',
                ]"
              >
                {{ t('stage.dual-conversation.transcript.empty') }}
              </div>
            </div>
          </div>

          <div
            :class="[
              'min-h-0 overflow-y-auto rounded-2xl p-4',
              'border border-white/20 bg-white/76 shadow-lg backdrop-blur-xl',
              'dark:border-white/10 dark:bg-neutral-950/72',
            ]"
          >
            <div :class="['flex flex-col gap-4']">
              <FieldTextArea
                v-model="seed"
                :label="t('stage.dual-conversation.seed.label')"
                :description="t('stage.dual-conversation.seed.description')"
                :placeholder="t('stage.dual-conversation.seed.placeholder')"
                :rows="3"
                :required="true"
              />
              <FieldInput
                v-model="turnLimit"
                type="number"
                min="0"
                max="100"
                :label="t('stage.dual-conversation.turn-limit.label')"
                :description="t('stage.dual-conversation.turn-limit.description')"
              />

              <Callout v-if="visibleError" theme="orange" :label="statusLabel">
                {{ visibleError }}
              </Callout>

              <div :class="['grid grid-cols-2 gap-2']">
                <Button
                  v-if="isRunning || isStarting"
                  data-testid="dual-stop"
                  color="red"
                  variant="primary"
                  icon="i-solar:stop-circle-linear"
                  :class="['col-span-2']"
                  @click="stopConversation"
                >
                  {{ t('stage.dual-conversation.actions.stop') }}
                </Button>
                <Button
                  v-else
                  data-testid="dual-start"
                  color="primary"
                  variant="primary"
                  icon="i-solar:play-circle-linear"
                  :disabled="!canStart"
                  :loading="isStarting"
                  :class="['col-span-2']"
                  @click="startConversation"
                >
                  {{ t('stage.dual-conversation.actions.start') }}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <DialogRoot v-model:open="configOpen">
      <DialogPortal>
        <DialogOverlay
          :class="[
            'fixed inset-0 z-[9999]',
            'bg-black/55 backdrop-blur-sm',
            'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
          ]"
        />
        <DialogContent
          :class="[
            'fixed left-1/2 top-1/2 z-[10000]',
            '-translate-x-1/2 -translate-y-1/2',
            'max-h-[92dvh] max-w-6xl w-[94dvw]',
            'overflow-y-auto rounded-2xl p-5 shadow-2xl outline-none',
            'border border-neutral-200 bg-white',
            'dark:border-neutral-800 dark:bg-neutral-950',
            'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
          ]"
        >
          <div :class="['mb-5 flex items-start justify-between gap-4']">
            <div>
              <DialogTitle :class="['text-xl font-700']">
                {{ t('stage.dual-conversation.configuration.title') }}
              </DialogTitle>
              <DialogDescription
                :class="[
                  'mt-1 max-w-3xl',
                  'text-sm text-neutral-500 dark:text-neutral-400',
                ]"
              >
                {{ t('stage.dual-conversation.configuration.description') }}
              </DialogDescription>
            </div>
            <Button size="sm" icon="i-solar:close-circle-linear" @click="configOpen = false">
              {{ t('stage.dual-conversation.configuration.done') }}
            </Button>
          </div>

          <Callout
            v-if="needsProviderSetup"
            theme="orange"
            :label="t('stage.dual-conversation.credentials-required.title')"
            :class="['mb-5']"
          >
            <p>{{ t('stage.dual-conversation.credentials-required.description') }}</p>
            <Button size="sm" :class="['mt-3']" @click="openProviderSettings">
              {{ t('stage.dual-conversation.configuration.open-providers') }}
            </Button>
          </Callout>

          <div :class="['grid grid-cols-1 gap-5 md:grid-cols-2']">
            <section
              v-for="side in (['left', 'right'] as const)"
              :key="side"
              :data-config-side="side"
              :class="[
                'flex flex-col gap-4 rounded-2xl p-4',
                'border border-neutral-200 bg-neutral-50/70',
                'dark:border-neutral-800 dark:bg-neutral-900/70',
              ]"
            >
              <div :class="['flex items-center justify-between gap-3']">
                <h3 :class="['text-base font-700']">
                  {{ t(`stage.dual-conversation.configuration.side-${side}`) }}
                </h3>
                <span
                  :class="[
                    'rounded-full bg-neutral-200 px-2 py-1',
                    'text-[0.68rem] font-650 uppercase',
                    'dark:bg-neutral-800',
                  ]"
                >
                  {{ side }}
                </span>
              </div>

              <FieldCombobox
                :model-value="configuration[side].cardId"
                :label="t('stage.dual-conversation.configuration.character')"
                :options="characterOptions"
                layout="vertical"
                @update:model-value="onCharacterSelected(side, $event)"
              />
              <FieldInput
                v-model="configuration[side].name"
                :label="t('stage.dual-conversation.configuration.name')"
                required
              />
              <FieldCombobox
                :model-value="configuration[side].displayModelId"
                :label="t('stage.dual-conversation.configuration.vrm')"
                :options="vrmOptions"
                layout="vertical"
                @update:model-value="onModelSelected(side, $event)"
              />

              <div :class="['h-px bg-neutral-200 dark:bg-neutral-800']" />

              <FieldCombobox
                v-model="configuration[side].chatProviderId"
                :label="t('stage.dual-conversation.configuration.chat-connection')"
                :options="providerOptions('chat')"
                :disabled="catalogLoading[side]"
                layout="vertical"
              >
                <template #empty>
                  {{ t('stage.dual-conversation.configuration.provider-empty') }}
                </template>
              </FieldCombobox>
              <FieldCombobox
                v-model="configuration[side].chatModel"
                :label="t('stage.dual-conversation.configuration.chat-model')"
                :options="modelOptions(side, 'chat')"
                :disabled="catalogLoading[side] || !configuration[side].chatProviderId"
                layout="vertical"
              >
                <template #empty>
                  {{ t('stage.dual-conversation.configuration.catalog-empty') }}
                </template>
              </FieldCombobox>

              <div :class="['h-px bg-neutral-200 dark:bg-neutral-800']" />

              <FieldCombobox
                v-model="configuration[side].speechProviderId"
                :label="t('stage.dual-conversation.configuration.speech-connection')"
                :options="providerOptions('speech')"
                :disabled="catalogLoading[side]"
                layout="vertical"
              >
                <template #empty>
                  {{ t('stage.dual-conversation.configuration.provider-empty') }}
                </template>
              </FieldCombobox>
              <FieldCombobox
                v-model="configuration[side].speechModel"
                :label="t('stage.dual-conversation.configuration.speech-model')"
                :options="modelOptions(side, 'speech')"
                :disabled="catalogLoading[side] || !configuration[side].speechProviderId"
                layout="vertical"
              >
                <template #empty>
                  {{ t('stage.dual-conversation.configuration.catalog-empty') }}
                </template>
              </FieldCombobox>
              <FieldCombobox
                v-if="speechVoices[side].length"
                v-model="configuration[side].speechVoiceId"
                :label="t('stage.dual-conversation.configuration.voice')"
                :options="voiceOptions(side)"
                :disabled="catalogLoading[side]"
                layout="vertical"
              />
              <FieldInput
                v-else
                v-model="configuration[side].speechVoiceId"
                :label="t('stage.dual-conversation.configuration.custom-voice')"
                :description="t('stage.dual-conversation.configuration.voice-empty')"
                required
              />

              <Callout v-if="catalogErrors[side]" theme="orange" :label="configuration[side].name">
                {{ t(`stage.dual-conversation.errors.${catalogErrors[side]}`) }}
              </Callout>
            </section>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </BackgroundProvider>
</template>

<route lang="yaml">
name: IndexScenePage
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>
