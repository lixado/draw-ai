import parameterPromptTemplate from '../prompts/parameter-generation.md?raw'
import groqConfig from '../groq/groq-config.json'
import { createGroqParameterClient, type GroqModelConfig } from './groq/groqClient'
import { createLocalParameterClient } from './local/transformersClient'
import type { ParameterCandidate, ParameterModelClient, ParameterProviderContext, ParameterModelSource } from '../parameterProvider'

const localModelIds = ['Xenova/distilgpt2', 'Xenova/phi-2'] as const
const groqModelConfigs: GroqModelConfig[] =
  (groqConfig.models as GroqModelConfig[] | undefined)?.filter((entry) => !!entry?.model) ?? []

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

export const createParameterModelRegistry = (deps: {
  getGroqApiKey: () => string
  onGroqRateLimit: () => void
}): ParameterModelClient[] => [
  ...localModelIds.map((model) =>
    createLocalParameterClient(model, {
      buildPrompt,
      parseJson: parseProviderJson
    })
  ),
  ...groqModelConfigs.map((config) =>
    createGroqParameterClient(config, {
      getApiKey: deps.getGroqApiKey,
      onRateLimit: deps.onGroqRateLimit,
      buildPrompt,
      parseJson: parseProviderJson
    })
  )
]

export const listParameterModelsBySource = (
  models: ParameterModelClient[],
  source?: ParameterModelSource
): ParameterModelClient[] => (source ? models.filter((client) => client.source === source) : models)
