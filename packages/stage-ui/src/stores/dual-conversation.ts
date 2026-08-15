import type { ChatProvider, SpeechProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type {
  DualConversationAgent,
  DualConversationSide,
  DualConversationSnapshot,
} from '../services/dual-conversation-runtime'
import type {
  DualConversationConfiguration,
} from './dual-conversation-configuration'
import type { ModelInfo, VoiceInfo } from './providers/provider'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { generateSpeech } from '@xsai/generate-speech'
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'

import { useLlmmarkerParser } from '../composables/llm-marker-parser'
import { DualConversationRuntime } from '../services/dual-conversation-runtime'
import { useLLM } from './ai/chat-llm/llm'
import { useAudioContext } from './audio'
import { DisplayModelFormat, useDisplayModelsStore } from './display-models'
import { validateDualConversationConfiguration } from './dual-conversation-configuration'
import { resolveSystemPrompt, useAiriCardStore } from './modules/airi-card'
import { useProviderConfigStore } from './providers/config'
import { useProviderStore } from './providers/provider'

/** One configured provider instance safe to expose in a selector. */
export interface DualConversationProviderOption {
  definitionId: string
  id: string
  label: string
}

const CHAT_DEFINITION_IDS = new Set(['openai', 'openai-compatible'])
const SPEECH_DEFINITION_IDS = new Set(['openai-audio-speech', 'openai-compatible-audio-speech'])
const SPEECH_FADE_SECONDS = 0.006

type DualConversationLoadErrorCode = 'catalog-unavailable' | 'initialization-failed'

const DEFAULT_CONFIGURATION: DualConversationConfiguration = {
  left: {
    cardId: 'default',
    chatModel: '',
    chatProviderId: '',
    displayModelId: 'preset-vrm-1',
    name: 'AIRI One',
    speechModel: '',
    speechProviderId: '',
    speechVoiceId: 'coral',
  },
  right: {
    cardId: 'default',
    chatModel: '',
    chatProviderId: '',
    displayModelId: 'preset-vrm-2',
    name: 'AIRI Two',
    speechModel: '',
    speechProviderId: '',
    speechVoiceId: 'nova',
  },
}

function emptyConversationSnapshot(): DualConversationSnapshot {
  return {
    phase: 'idle',
    seed: '',
    turns: [],
  }
}

function isRunningPhase(phase: DualConversationSnapshot['phase']) {
  return phase === 'generating' || phase === 'speaking'
}

/** Owns exactly two independently configured AIRI conversation slots. */
export const useDualConversationStore = defineStore('dual-conversation', () => {
  const configuration = useLocalStorageManualReset<DualConversationConfiguration>(
    'settings/dual-conversation/configuration',
    structuredClone(DEFAULT_CONFIGURATION),
    { deep: true },
  )
  const seed = ref('')
  const turnLimit = useLocalStorageManualReset('settings/dual-conversation/turn-limit', 0)
  const conversation = ref<DualConversationSnapshot>(emptyConversationSnapshot())
  const initializationError = ref<DualConversationLoadErrorCode>()
  const catalogErrors = reactive<Record<DualConversationSide, DualConversationLoadErrorCode | undefined>>({
    left: undefined,
    right: undefined,
  })
  const catalogLoading = reactive<Record<DualConversationSide, boolean>>({
    left: false,
    right: false,
  })
  const chatModels = reactive<Record<DualConversationSide, ModelInfo[]>>({
    left: [],
    right: [],
  })
  const speechModels = reactive<Record<DualConversationSide, ModelInfo[]>>({
    left: [],
    right: [],
  })
  const speechVoices = reactive<Record<DualConversationSide, VoiceInfo[]>>({
    left: [],
    right: [],
  })
  const leftModelSrc = ref<string>()
  const rightModelSrc = ref<string>()
  const leftAudioSource = shallowRef<AudioBufferSourceNode>()
  const rightAudioSource = shallowRef<AudioBufferSourceNode>()

  const providerConfigStore = useProviderConfigStore()
  const providerStore = useProviderStore()
  const displayModelsStore = useDisplayModelsStore()
  const cardStore = useAiriCardStore()
  const llm = useLLM()
  const { audioContext } = useAudioContext()

  let runtime: DualConversationRuntime | undefined
  let startSequence = 0
  const catalogRequestIds: Record<DualConversationSide, number> = { left: 0, right: 0 }
  const voiceRequestIds: Record<DualConversationSide, number> = { left: 0, right: 0 }
  const objectUrls: Partial<Record<DualConversationSide, string>> = {}

  const characterOptions = computed(() => [...cardStore.cards.entries()].map(([id, card]) => ({
    label: card.name,
    value: id,
  })))

  const vrmOptions = computed(() => displayModelsStore.displayModels
    .filter(model => model.format === DisplayModelFormat.VRM)
    .map(model => ({ label: model.name, value: model.id })))

  function providerOptionsFor(definitionIds: Set<string>): DualConversationProviderOption[] {
    return Object.values(providerConfigStore.providers)
      .filter(provider => provider.status === 'configured' && definitionIds.has(provider.definitionId))
      .map((provider) => {
        const metadata = providerStore.availableProvidersMetadata
          .find(candidate => candidate.id === provider.definitionId)
        const definitionName = metadata?.localizedName
          ?? (provider.definitionId.includes('compatible') ? 'OpenAI Compatible' : 'OpenAI')
        return {
          definitionId: provider.definitionId,
          id: provider.id,
          label: `${definitionName} · ${provider.id}`,
        }
      })
  }

  const chatProviderOptions = computed(() => providerOptionsFor(CHAT_DEFINITION_IDS))
  const speechProviderOptions = computed(() => providerOptionsFor(SPEECH_DEFINITION_IDS))
  const isRunning = computed(() => isRunningPhase(conversation.value.phase))

  const configurationError = computed(() => validateDualConversationConfiguration(configuration.value, {
    hasCard: cardId => !!cardStore.getCard(cardId),
    hasChatProvider: providerId => chatProviderOptions.value.some(provider => provider.id === providerId),
    hasSpeechProvider: providerId => speechProviderOptions.value.some(provider => provider.id === providerId),
  }))

  function slotFor(side: DualConversationSide) {
    return configuration.value[side]
  }

  function setModelSource(side: DualConversationSide, source: string | undefined) {
    if (side === 'left')
      leftModelSrc.value = source
    else
      rightModelSrc.value = source
  }

  function setAudioSource(side: DualConversationSide, source: AudioBufferSourceNode | undefined) {
    if (side === 'left')
      leftAudioSource.value = source
    else
      rightAudioSource.value = source
  }

  function revokeObjectUrl(side: DualConversationSide) {
    const current = objectUrls[side]
    if (!current)
      return

    URL.revokeObjectURL(current)
    delete objectUrls[side]
  }

  /** Resolves a persisted AIRI display model into one per-slot VRM source. */
  async function refreshModelSource(side: DualConversationSide) {
    const model = await displayModelsStore.getDisplayModel(slotFor(side).displayModelId)
    if (!model || model.format !== DisplayModelFormat.VRM) {
      revokeObjectUrl(side)
      setModelSource(side, undefined)
      throw new Error(`${slotFor(side).name} needs a valid VRM display model`)
    }

    const source = model.type === 'url' ? model.url : URL.createObjectURL(model.file)
    revokeObjectUrl(side)
    if (model.type === 'file')
      objectUrls[side] = source
    setModelSource(side, source)
  }

  /** Applies the module choices embedded in one AIRI Card. */
  async function selectCharacter(side: DualConversationSide, cardId: string) {
    const card = cardStore.getCard(cardId)
    if (!card)
      return

    const slot = slotFor(side)
    const modules = card.extensions.airi.modules
    slot.cardId = cardId
    slot.name = card.name
    slot.displayModelId = modules.displayModelId || slot.displayModelId
    slot.chatProviderId = modules.consciousness.provider || slot.chatProviderId
    slot.chatModel = modules.consciousness.model || slot.chatModel
    slot.speechProviderId = modules.speech.provider || slot.speechProviderId
    slot.speechModel = modules.speech.model || slot.speechModel
    slot.speechVoiceId = modules.speech.voice_id || slot.speechVoiceId

    await Promise.all([
      refreshModelSource(side),
      refreshSlotCatalog(side),
    ])
  }

  /**
   * Refreshes one slot's model catalogs.
   *
   * Each request captures both provider IDs and a request ID. A later selection
   * supersedes in-flight work, so stale results cannot replace the new catalogs.
   */
  async function refreshSlotCatalog(side: DualConversationSide) {
    const slot = slotFor(side)
    const requestId = ++catalogRequestIds[side]
    const chatProviderId = slot.chatProviderId
    const speechProviderId = slot.speechProviderId
    catalogLoading[side] = true
    catalogErrors[side] = undefined

    try {
      const [nextChatModels, nextSpeechModels] = await Promise.all([
        chatProviderId ? providerStore.fetchModelsForProvider(chatProviderId) : Promise.resolve([]),
        speechProviderId ? providerStore.fetchModelsForProvider(speechProviderId) : Promise.resolve([]),
      ])
      if (
        requestId !== catalogRequestIds[side]
        || chatProviderId !== slot.chatProviderId
        || speechProviderId !== slot.speechProviderId
      ) {
        return
      }

      chatModels[side] = nextChatModels
      speechModels[side] = nextSpeechModels

      if (nextChatModels.length && !nextChatModels.some(model => model.id === slot.chatModel))
        slot.chatModel = nextChatModels[0].id
      if (nextSpeechModels.length && !nextSpeechModels.some(model => model.id === slot.speechModel))
        slot.speechModel = nextSpeechModels[0].id

      await refreshSpeechVoices(side)
    }
    catch {
      if (requestId === catalogRequestIds[side])
        catalogErrors[side] = 'catalog-unavailable'
    }
    finally {
      if (requestId === catalogRequestIds[side])
        catalogLoading[side] = false
    }
  }

  /** Reloads voices only when the provider and model still match the request. */
  async function refreshSpeechVoices(side: DualConversationSide) {
    const slot = slotFor(side)
    const requestId = ++voiceRequestIds[side]
    const speechProviderId = slot.speechProviderId
    const speechModel = slot.speechModel
    if (!speechProviderId) {
      speechVoices[side] = []
      return
    }

    try {
      const voices = await providerStore.listProviderVoices(speechProviderId, speechModel)
      if (
        requestId !== voiceRequestIds[side]
        || speechProviderId !== slot.speechProviderId
        || speechModel !== slot.speechModel
      ) {
        return
      }

      speechVoices[side] = voices.filter(voice =>
        !voice.compatibleModels?.length || voice.compatibleModels.includes(speechModel),
      )
      if (speechVoices[side].length && !speechVoices[side].some(voice => voice.id === slot.speechVoiceId))
        slot.speechVoiceId = speechVoices[side][0].id
    }
    catch {
      if (requestId === voiceRequestIds[side]) {
        speechVoices[side] = []
        catalogErrors[side] = 'catalog-unavailable'
      }
    }
  }

  async function createAgent(side: DualConversationSide): Promise<DualConversationAgent> {
    const slot = { ...slotFor(side) }
    const card = cardStore.getCard(slot.cardId)
    if (!card)
      throw new Error(`${slot.name} is missing its AIRI Card`)

    const [chatProvider, speechProvider] = await Promise.all([
      providerStore.getProviderInstance<ChatProvider>(slot.chatProviderId),
      providerStore.getProviderInstance<SpeechProvider>(slot.speechProviderId),
    ])

    return {
      side,
      name: slot.name.trim(),
      systemPrompt: resolveSystemPrompt(card),
      generate: async (messages, options) => {
        let literalText = ''
        const parser = useLlmmarkerParser({
          onLiteral(literal) {
            literalText += literal
            options.onDelta(literal)
          },
        })

        await llm.stream(slot.chatModel, chatProvider, messages as Message[], {
          abortSignal: options.signal,
          supportsTools: false,
          onStreamEvent: async (event) => {
            if (event.type === 'text-delta')
              await parser.consume(event.text)
          },
        })
        await parser.end()
        return literalText
      },
      speak: async (text, signal) => {
        signal.throwIfAborted()
        const response = await generateSpeech({
          ...speechProvider.speech(slot.speechModel),
          input: text,
          voice: slot.speechVoiceId,
        })
        signal.throwIfAborted()

        const audioBuffer = await audioContext.decodeAudioData(response.slice(0))
        signal.throwIfAborted()
        await playAudioBuffer(side, audioBuffer, signal)
      },
    }
  }

  async function playAudioBuffer(side: DualConversationSide, buffer: AudioBuffer, signal: AbortSignal) {
    const source = audioContext.createBufferSource()
    const gain = audioContext.createGain()
    const startTime = audioContext.currentTime
    const fadeDuration = Math.min(SPEECH_FADE_SECONDS, buffer.duration / 2)
    source.buffer = buffer
    source.connect(gain)
    gain.connect(audioContext.destination)
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(1, startTime + fadeDuration)
    gain.gain.setValueAtTime(1, startTime + buffer.duration - fadeDuration)
    gain.gain.linearRampToValueAtTime(0, startTime + buffer.duration)
    setAudioSource(side, source)

    await new Promise<void>((resolve) => {
      let settled = false
      function finish() {
        if (settled)
          return
        settled = true
        signal.removeEventListener('abort', stopPlayback)
        source.disconnect()
        gain.disconnect()
        setAudioSource(side, undefined)
        resolve()
      }
      function stopPlayback() {
        try {
          source.stop()
        }
        catch {}
        finish()
      }

      signal.addEventListener('abort', stopPlayback, { once: true })
      source.onended = finish
      source.start()
    })
  }

  /** Starts the self-running dialogue after the user supplies a seed. */
  async function start() {
    const issue = configurationError.value
    if (issue)
      throw new Error(issue)

    runtime?.stop()
    runtime = undefined
    const currentStartSequence = ++startSequence
    await audioContext.resume()
    const agents = await Promise.all([
      createAgent('left'),
      createAgent('right'),
    ])
    if (currentStartSequence !== startSequence)
      return

    runtime = new DualConversationRuntime({
      agents,
      onStateChange(snapshot) {
        conversation.value = snapshot
      },
    })
    await runtime.start({
      seed: seed.value,
      turnLimit: turnLimit.value,
    })
  }

  /** Stops generation and any active character speech immediately. */
  function stop() {
    startSequence += 1
    runtime?.stop()
    runtime = undefined
  }

  /** Loads persisted cards, VRMs, models, and voices for both slots. */
  async function initialize() {
    initializationError.value = undefined
    try {
      await displayModelsStore.loadDisplayModelsFromIndexedDB()
      await Promise.all([
        refreshModelSource('left'),
        refreshModelSource('right'),
        refreshSlotCatalog('left'),
        refreshSlotCatalog('right'),
      ])
    }
    catch {
      initializationError.value = 'initialization-failed'
    }
  }

  /** Releases temporary VRM URLs and the active conversation runtime. */
  function dispose() {
    stop()
    revokeObjectUrl('left')
    revokeObjectUrl('right')
  }

  return {
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

    dispose,
    initialize,
    refreshModelSource,
    refreshSlotCatalog,
    refreshSpeechVoices,
    selectCharacter,
    start,
    stop,
  }
})
