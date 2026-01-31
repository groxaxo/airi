/**
 * Agent Instance
 *
 * Represents a single AI agent with its configuration and generation capabilities.
 */

import type { Message } from '@xsai/shared-chat'

import type { AgentConfig, ShortTermMemoryEntry } from '../types'

export interface AgentInstanceOptions {
  defaultProvider?: string
  defaultModel?: string
}

/**
 * AgentInstance wraps an agent configuration and provides LLM generation.
 */
export class AgentInstance {
  readonly config: AgentConfig
  private conversationHistory: Message[] = []

  constructor(config: AgentConfig, _options: AgentInstanceOptions = {}) {
    this.config = config
    // NOTICE: options parameter reserved for future provider configuration
  }

  /**
   * Generate a response from the agent
   */
  async generate(prompt: string, context: ShortTermMemoryEntry[] = []): Promise<string> {
    const systemMessage = this.buildSystemMessage()
    const contextMessages = this.buildContextMessages(context)

    const messages: Message[] = [
      { role: 'system', content: systemMessage },
      ...contextMessages,
      ...this.conversationHistory.slice(-10), // Keep last 10 messages
      { role: 'user', content: prompt },
    ]

    // Use xsai for generation
    // NOTICE: In a real implementation, this would use the configured provider
    // For now, we return a placeholder that the mode controllers will replace
    // with actual LLM calls using the configured provider

    const response = await this.callLLM(messages)

    // Update conversation history
    this.conversationHistory.push(
      { role: 'user', content: prompt },
      { role: 'assistant', content: response },
    )

    // Trim history if too long
    if (this.conversationHistory.length > 50) {
      this.conversationHistory = this.conversationHistory.slice(-40)
    }

    return response
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = []
  }

  /**
   * Get current conversation history
   */
  getHistory(): Message[] {
    return [...this.conversationHistory]
  }

  private buildSystemMessage(): string {
    const parts: string[] = [this.config.systemPrompt]

    if (this.config.role) {
      parts.push(`\nYour assigned role is: ${this.config.role}`)
    }

    parts.push(`\nYour name is: ${this.config.name}`)

    return parts.join('')
  }

  private buildContextMessages(context: ShortTermMemoryEntry[]): Message[] {
    if (context.length === 0) {
      return []
    }

    const contextText = context
      .map((entry) => {
        const prefix = entry.agentId === this.config.id ? 'You' : entry.agentId
        return `[${entry.type}] ${prefix}: ${entry.content}`
      })
      .join('\n')

    return [
      {
        role: 'user',
        content: `Recent context:\n${contextText}`,
      },
    ]
  }

  /**
   * Call the LLM with the given messages
   * This is a placeholder that should be replaced with actual provider calls
   */
  private async callLLM(_messages: Message[]): Promise<string> {
    // NOTICE: This is a placeholder implementation.
    // In production, this would use @xsai-ext/providers to call the actual LLM.
    // The integration with providers.ts from stage-ui would be done at the
    // mode controller level, which has access to the Pinia stores.

    // For now, we throw to indicate this needs to be called through the mode controller
    throw new Error(
      'AgentInstance.callLLM is a placeholder. Use mode controllers with provider integration.',
    )
  }
}

/**
 * Factory function to create an agent instance
 */
export function createAgentInstance(config: AgentConfig, options?: AgentInstanceOptions): AgentInstance {
  return new AgentInstance(config, options)
}
