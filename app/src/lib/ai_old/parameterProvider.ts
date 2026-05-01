import { createParameterModelRegistry, listParameterModelsBySource } from './models/registry'

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

export type ParameterModelSource = 'local' | 'groq'

export type ParameterModelClient = {
  id: string
  source: ParameterModelSource
  label: string
  generate: (context: ParameterProviderContext) => Promise<ParameterCandidate | null>
  prewarm?: () => Promise<void>
}

export type ParameterProvider = {
  generate: (context: ParameterProviderContext) => Promise<ParameterCandidate | null>
  prewarm?: () => Promise<void>
  preferredSource?: ParameterModelSource
}

let providerWarningHandler: ((message: string) => void) | null = null
let activeProviderSource: ParameterModelSource = 'local'
let groqApiKey = ''

const parameterModelRegistry = createParameterModelRegistry({
  getGroqApiKey: () => groqApiKey,
  onGroqRateLimit: () => {
    providerWarningHandler?.('Groq rate limited. Change to Local model or use a new API key.')
  }
})

const listBySource = (source?: ParameterModelSource): ParameterModelClient[] =>
  listParameterModelsBySource(parameterModelRegistry, source)

const localModelProvider: ParameterProvider = {
  preferredSource: 'local',
  generate: async (context) => {
    const firstLocalClient = listBySource('local')[0]
    if (!firstLocalClient) return null
    return firstLocalClient.generate(context)
  },
  prewarm: async () => {
    const firstLocalClient = listBySource('local')[0]
    if (firstLocalClient?.prewarm) await firstLocalClient.prewarm()
  }
}

let activeParameterProvider: ParameterProvider = localModelProvider

export const setProviderWarningHandler = (handler: ((message: string) => void) | null) => {
  providerWarningHandler = handler
}

export const setGroqApiKey = (apiKey: string) => {
  groqApiKey = apiKey.trim()
}

export const listParameterModelClients = (source?: ParameterModelSource): ParameterModelClient[] => listBySource(source)

export const createGroqParameterProvider = (apiKey: string): ParameterProvider => {
  setGroqApiKey(apiKey)
  return {
    preferredSource: 'groq',
    generate: async (context) => {
      const firstGroqClient = listBySource('groq')[0]
      if (!firstGroqClient) return null
      return firstGroqClient.generate(context)
    },
    prewarm: async () => {}
  }
}

export const setParameterProvider = (provider: ParameterProvider) => {
  activeParameterProvider = provider
  activeProviderSource = provider.preferredSource ?? 'local'
}

export const resetParameterProvider = () => {
  activeProviderSource = 'local'
  activeParameterProvider = localModelProvider
}

export const getActiveParameterProviderSource = (): ParameterModelSource => activeProviderSource

export const generateParameterCandidate = async (
  context: ParameterProviderContext,
  modelClientId?: string
): Promise<ParameterCandidate | null> => {
  if (modelClientId) {
    const client = parameterModelRegistry.find((item) => item.id === modelClientId)
    if (!client) return null
    return client.generate(context)
  }
  return activeParameterProvider.generate(context)
}

export const prewarmParameterProvider = async (): Promise<void> => {
  if (activeParameterProvider.prewarm) await activeParameterProvider.prewarm()
}
