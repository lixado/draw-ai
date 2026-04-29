import { getSuggestionTextGenerator, prewarmSuggestionTextGenerator } from './modelLoad'
import parameterPromptTemplate from './promts/parameter-generation.md?raw'

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
    const prompt = buildPrompt({ totalStrokes, undoneCount, maxStrokeCount })

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          temperature: 0.35,
          max_tokens: 120,
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
