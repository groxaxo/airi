/** Persisted IDs and display name for one side of the dual stage. */
export interface DualConversationSlotConfiguration {
  cardId: string
  chatModel: string
  chatProviderId: string
  displayModelId: string
  name: string
  speechModel: string
  speechProviderId: string
  speechVoiceId: string
}

/** The fixed left/right pair; no additional agent slots are supported. */
export interface DualConversationConfiguration {
  left: DualConversationSlotConfiguration
  right: DualConversationSlotConfiguration
}

/** Live lookups used to reject stale persisted IDs before a run starts. */
export interface DualConversationValidationContext {
  hasCard: (cardId: string) => boolean
  hasChatProvider: (providerId: string) => boolean
  hasSpeechProvider: (providerId: string) => boolean
}

/** Translation-safe configuration problems that can block a conversation. */
export type DualConversationConfigurationIssue
  = | 'left-card-required'
    | 'left-chat-provider-stale'
    | 'left-chat-required'
    | 'left-name-required'
    | 'left-speech-provider-stale'
    | 'left-speech-required'
    | 'left-vrm-required'
    | 'right-card-required'
    | 'right-chat-provider-stale'
    | 'right-chat-required'
    | 'right-name-required'
    | 'right-speech-provider-stale'
    | 'right-speech-required'
    | 'right-vrm-required'
    | 'separate-chat-models-required'
    | 'separate-chat-providers-required'
    | 'separate-speech-models-required'
    | 'separate-speech-providers-required'
    | 'separate-voices-required'

/**
 * Checks that both character slots can start with separate OpenAI resources.
 *
 * The return value is an i18n key suffix. The UI owns the translated copy.
 */
export function validateDualConversationConfiguration(
  configuration: DualConversationConfiguration,
  context: DualConversationValidationContext,
): DualConversationConfigurationIssue | undefined {
  const { left, right } = configuration
  const slots = [
    ['left', left],
    ['right', right],
  ] as const

  for (const [side, slot] of slots) {
    if (!slot.name.trim())
      return `${side}-name-required`
    if (!context.hasCard(slot.cardId))
      return `${side}-card-required`
    if (!slot.displayModelId)
      return `${side}-vrm-required`
    if (!slot.chatProviderId || !slot.chatModel)
      return `${side}-chat-required`
    if (!context.hasChatProvider(slot.chatProviderId))
      return `${side}-chat-provider-stale`
    if (!slot.speechProviderId || !slot.speechModel || !slot.speechVoiceId.trim())
      return `${side}-speech-required`
    if (!context.hasSpeechProvider(slot.speechProviderId))
      return `${side}-speech-provider-stale`
  }

  if (left.chatProviderId === right.chatProviderId)
    return 'separate-chat-providers-required'
  if (left.chatModel === right.chatModel)
    return 'separate-chat-models-required'
  if (left.speechProviderId === right.speechProviderId)
    return 'separate-speech-providers-required'
  if (left.speechModel === right.speechModel)
    return 'separate-speech-models-required'
  if (left.speechVoiceId.trim() === right.speechVoiceId.trim())
    return 'separate-voices-required'

  return undefined
}
