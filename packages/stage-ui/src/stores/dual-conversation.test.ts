import type { DualConversationConfiguration } from './dual-conversation-configuration'

import { describe, expect, it } from 'vitest'

import { validateDualConversationConfiguration } from './dual-conversation-configuration'

function validConfiguration(): DualConversationConfiguration {
  return {
    left: {
      cardId: 'left-card',
      chatModel: 'gpt-left',
      chatProviderId: 'chat-left',
      displayModelId: 'vrm-left',
      name: 'AIRI One',
      speechModel: 'tts-left',
      speechProviderId: 'speech-left',
      speechVoiceId: 'coral',
    },
    right: {
      cardId: 'right-card',
      chatModel: 'gpt-right',
      chatProviderId: 'chat-right',
      displayModelId: 'vrm-right',
      name: 'AIRI Two',
      speechModel: 'tts-right',
      speechProviderId: 'speech-right',
      speechVoiceId: 'nova',
    },
  }
}

describe('validateDualConversationConfiguration', () => {
  const context = {
    hasCard: (cardId: string) => cardId.endsWith('-card'),
    hasChatProvider: (providerId: string) => providerId.startsWith('chat-'),
    hasSpeechProvider: (providerId: string) => providerId.startsWith('speech-'),
  }

  it('accepts two completely separate character runtimes', () => {
    expect(validateDualConversationConfiguration(validConfiguration(), context)).toBeUndefined()
  })

  it('requires a valid AIRI Card for each side', () => {
    const configuration = validConfiguration()
    configuration.right.cardId = 'missing'

    expect(validateDualConversationConfiguration(configuration, context))
      .toBe('right-card-required')
  })

  it('rejects a shared chat credential connection', () => {
    const configuration = validConfiguration()
    configuration.right.chatProviderId = configuration.left.chatProviderId

    expect(validateDualConversationConfiguration(configuration, context))
      .toBe('separate-chat-providers-required')
  })

  it('rejects stale or unconfigured provider connections', () => {
    const configuration = validConfiguration()
    configuration.right.chatProviderId = 'missing-chat'

    expect(validateDualConversationConfiguration(configuration, context))
      .toBe('right-chat-provider-stale')
  })

  it('rejects a shared speech credential connection', () => {
    const configuration = validConfiguration()
    configuration.right.speechProviderId = configuration.left.speechProviderId

    expect(validateDualConversationConfiguration(configuration, context))
      .toBe('separate-speech-providers-required')
  })

  it('requires different voices and models', () => {
    const sameVoice = validConfiguration()
    sameVoice.right.speechVoiceId = sameVoice.left.speechVoiceId
    expect(validateDualConversationConfiguration(sameVoice, context))
      .toBe('separate-voices-required')

    const sameChatModel = validConfiguration()
    sameChatModel.right.chatModel = sameChatModel.left.chatModel
    expect(validateDualConversationConfiguration(sameChatModel, context))
      .toBe('separate-chat-models-required')

    const sameSpeechModel = validConfiguration()
    sameSpeechModel.right.speechModel = sameSpeechModel.left.speechModel
    expect(validateDualConversationConfiguration(sameSpeechModel, context))
      .toBe('separate-speech-models-required')
  })

  it('allows the same name or VRM when the two runtimes are otherwise separate', () => {
    const configuration = validConfiguration()
    configuration.right.name = configuration.left.name
    configuration.right.displayModelId = configuration.left.displayModelId

    expect(validateDualConversationConfiguration(configuration, context)).toBeUndefined()
  })
})
