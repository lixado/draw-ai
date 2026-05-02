import type { ProviderInterface } from '../provider_interface'

export type GroqProviderConfig = {
  model: string
}

const DEFAULT_GROQ_CONFIG: GroqProviderConfig = {
  model: 'llama-3.1-8b-instant',
}

const trimPromptToGroqLimit = (prompt: string): string => {
  return prompt
}

export class GroqProvider implements ProviderInterface {
  private apiKey: string | null = null

  constructor(private readonly config: GroqProviderConfig = DEFAULT_GROQ_CONFIG) {}

  modelInit(apiKey: string | null): void {
    this.apiKey = apiKey
  }

  async generate(systemPrompt: string, prompt: string, options?: { maxNewTokens?: number }): Promise<string> {
    if (!this.apiKey) return ''

    const boundedPrompt = trimPromptToGroqLimit(prompt)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.35,
          ...(typeof options?.maxNewTokens === 'number'
            ? { max_tokens: options.maxNewTokens }
            : {}),
          messages: [
            {
              role: 'system',
              content:
                systemPrompt.trim() ||
                'You are a helpful assistant. Reply with plain text only, no markdown.'
            },
            {
              role: 'user',
              content: boundedPrompt
            }
          ]
        })
      })

      if (!res.ok) return ''

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      return data.choices?.[0]?.message?.content ?? ''
    } catch {
      return ''
    }
  }

  destroy(): void {
    this.apiKey = null
  }
}
