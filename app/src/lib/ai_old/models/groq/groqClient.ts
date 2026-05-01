import type { ParameterCandidate, ParameterModelClient, ParameterProviderContext } from '../../parameterProvider'

export type GroqModelConfig = {
  model: string
  limits: {
    tpm: number
    maxCompletionTokens: number
    tokenSafetyMargin: number
  }
  promptBudgeting: {
    estimatedCharsPerToken: number
    maxPointsPerStroke: number
    minCurrentStrokes: number
    minUndoneStrokes: number
  }
}

type CreateGroqClientDeps = {
  getApiKey: () => string
  onRateLimit: () => void
  buildPrompt: (context: ParameterProviderContext) => string
  parseJson: (text: string) => ParameterCandidate | null
}

const trimPromptToGroqLimit = (prompt: string, config: GroqModelConfig): string => {
  const charsPerToken = Math.max(1, config.promptBudgeting.estimatedCharsPerToken)
  const promptTokenBudget = config.limits.tpm - config.limits.maxCompletionTokens - config.limits.tokenSafetyMargin
  const maxChars = Math.max(256, promptTokenBudget * charsPerToken)
  if (prompt.length <= maxChars) return prompt
  return `${prompt.slice(0, maxChars)}\n[trimmed-for-token-budget]`
}

export const createGroqParameterClient = (
  config: GroqModelConfig,
  deps: CreateGroqClientDeps
): ParameterModelClient => ({
  id: `groq:${config.model}`,
  source: 'groq',
  label: config.model,
  generate: async (context) => {
    const apiKey = deps.getApiKey()
    if (!apiKey) return null
    const prompt = trimPromptToGroqLimit(deps.buildPrompt(context), config)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.35,
          max_tokens: config.limits.maxCompletionTokens,
          messages: [
            {
              role: 'system',
              content: 'Return only one JSON object. No markdown, no prose.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      })
      if (res.status === 429) {
        deps.onRateLimit()
        return null
      }
      if (!res.ok) return null
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = data.choices?.[0]?.message?.content ?? ''
      return deps.parseJson(text)
    } catch {
      return null
    }
  }
})
