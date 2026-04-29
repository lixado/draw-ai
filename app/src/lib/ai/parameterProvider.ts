import { getSuggestionTextGenerator, prewarmSuggestionTextGenerator } from './modelLoad'
import parameterPromptTemplate from './promts/parameter-generation.md?raw'
import groqConfig from './groq/groq-config.json'

export type ParameterCandidate = {
  strokeCount?: number
  offsetX?: number
  offsetY?: number
  waveAmp?: number
  mirrorAxis?: 'none' | 'vertical' | 'horizontal'
  scale?: number
}

export type ParameterProviderContext = {
  totalStrokes: number
  undoneCount: number
  maxStrokeCount: number
}

export type ParameterProvider = {
  generate: (context: ParameterProviderContext) => Promise<ParameterCandidate | null>
  prewarm?: () => Promise<void>
}

let providerWarningHandler: ((message: string) => void) | null = null

type GroqModelConfig = {
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

const activeGroqModel: GroqModelConfig = (groqConfig.models?.[0] as GroqModelConfig) ?? {
  model: 'llama-3.1-8b-instant',
  limits: { tpm: 6000, maxCompletionTokens: 120, tokenSafetyMargin: 300 },
  promptBudgeting: { estimatedCharsPerToken: 4, maxPointsPerStroke: 24, minCurrentStrokes: 8, minUndoneStrokes: 1 }
}

export const setProviderWarningHandler = (handler: ((message: string) => void) | null) => {
  providerWarningHandler = handler
}

const parseProviderJson = (text: string): ParameterCandidate | null => {
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (!objectMatch) return null
  try {
    return JSON.parse(objectMatch[0]) as ParameterCandidate
  } catch {
    return null
  }
}

const buildPrompt = ({ totalStrokes, undoneCount, maxStrokeCount }: ParameterProviderContext): string => {
  const nonce = Math.random().toFixed(4)
  return parameterPromptTemplate
    .replaceAll('{maxStrokeCount}', String(maxStrokeCount))
    .replaceAll('{totalStrokes}', String(totalStrokes))
    .replaceAll('{undoneCount}', String(undoneCount))
    .replaceAll('{nonce}', nonce)
}

const trimPromptToGroqLimit = (prompt: string): string => {
  const charsPerToken = Math.max(1, activeGroqModel.promptBudgeting.estimatedCharsPerToken)
  const promptTokenBudget =
    activeGroqModel.limits.tpm - activeGroqModel.limits.maxCompletionTokens - activeGroqModel.limits.tokenSafetyMargin
  const maxChars = Math.max(256, promptTokenBudget * charsPerToken)
  if (prompt.length <= maxChars) return prompt
  return `${prompt.slice(0, maxChars)}\n[trimmed-for-token-budget]`
}

const localModelProvider: ParameterProvider = {
  generate: async ({ totalStrokes, undoneCount, maxStrokeCount }) => {
    const generator = await getSuggestionTextGenerator()
    if (!generator) return null

    const prompt = buildPrompt({ totalStrokes, undoneCount, maxStrokeCount })

    try {
      const out = await generator(prompt, { max_new_tokens: 32, temperature: 0.25 })
      const text = out?.[0]?.generated_text ?? ''
      return parseProviderJson(text)
    } catch {
      return null
    }
  },
  prewarm: async () => {
    await prewarmSuggestionTextGenerator()
  }
}

export const createGroqParameterProvider = (apiKey: string): ParameterProvider => ({
  generate: async ({ totalStrokes, undoneCount, maxStrokeCount }) => {
    if (!apiKey) return null
    const prompt = trimPromptToGroqLimit(buildPrompt({ totalStrokes, undoneCount, maxStrokeCount }))

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: activeGroqModel.model,
          temperature: 0.35,
          max_tokens: activeGroqModel.limits.maxCompletionTokens,
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
        providerWarningHandler?.('Groq rate limited. Change to Local model or use a new API key.')
        return null
      }
      if (!res.ok) return null
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = data.choices?.[0]?.message?.content ?? ''
      return parseProviderJson(text)
    } catch {
      return null
    }
  }
})

let activeParameterProvider: ParameterProvider = localModelProvider

export const setParameterProvider = (provider: ParameterProvider) => {
  activeParameterProvider = provider
}

export const resetParameterProvider = () => {
  activeParameterProvider = localModelProvider
}

export const generateParameterCandidate = async (
  context: ParameterProviderContext
): Promise<ParameterCandidate | null> => activeParameterProvider.generate(context)

export const prewarmParameterProvider = async (): Promise<void> => {
  if (activeParameterProvider.prewarm) await activeParameterProvider.prewarm()
}
