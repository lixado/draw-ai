import type { LayerData, StrokeData } from './types'

type ProviderMode = 'local' | 'groq'

const MODEL_PROVIDER_KEY = 'drawai:model-provider'
const MODEL_ID_KEY = 'drawai:model-id'
const GROQ_KEY = 'drawai:groq-key'
const PROJECT_STORAGE_KEY = 'drawai:project-v2'
const NEAR_LIMIT_BYTES = 4.5 * 1024 * 1024

export type PersistedProjectState = {
  strokes: StrokeData[]
  layers: LayerData[]
  activeLayerId: string
  visibleLayerIds: string[]
  recentColors: string[]
  canvasPresetId: string
  canvasWidth: number
  canvasHeight: number
}

export const saveProviderMode = (mode: ProviderMode, groqApiKey?: string) => {
  localStorage.setItem(MODEL_PROVIDER_KEY, mode)
  if (mode === 'groq' && typeof groqApiKey === 'string') {
    localStorage.setItem(GROQ_KEY, groqApiKey)
  }
}

export const loadProviderMode = () => {
  const provider = localStorage.getItem(MODEL_PROVIDER_KEY)
  const providerMode = provider === 'local' || provider === 'groq' ? provider : null
  const modelId = localStorage.getItem(MODEL_ID_KEY) ?? ''
  const groqApiKey = localStorage.getItem(GROQ_KEY) ?? ''
  return { providerMode, modelId, groqApiKey }
}

export const saveModelId = (modelId: string) => {
  localStorage.setItem(MODEL_ID_KEY, modelId)
}

export const saveProjectState = (state: PersistedProjectState): 'ok' | 'near_limit' | 'full' => {
  try {
    const payload = JSON.stringify(state)
    localStorage.setItem(PROJECT_STORAGE_KEY, payload)
    const usedBytes = payload.length * 2
    return usedBytes > NEAR_LIMIT_BYTES ? 'near_limit' : 'ok'
  } catch {
    return 'full'
  }
}

export const loadProjectState = (): PersistedProjectState | null => {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedProjectState
  } catch {
    return null
  }
}
