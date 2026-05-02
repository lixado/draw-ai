import { get, writable } from 'svelte/store'
import { GroqProvider } from './groq/groq'
import { TransformersProvider } from './local/transformers'
import type { ProviderInterface } from './provider_interface'

export type ProviderId = 'local' | 'groq'

export type ActiveModelSelection = {
  providerId: ProviderId
  model: string
}

const activeSelectionStore = writable<ActiveModelSelection | null>(null)
const activeProviderStore = writable<ProviderInterface | null>(null)

export const activeModelSelection = {
  subscribe: activeSelectionStore.subscribe
}

export const activeProvider = {
  subscribe: activeProviderStore.subscribe
}

export const getActiveProvider = () => get(activeProviderStore)
export const getActiveModelSelection = () => get(activeSelectionStore)

const createProvider = (selection: ActiveModelSelection): ProviderInterface => {
  if (selection.providerId === 'groq') return new GroqProvider({ model: selection.model })
  return new TransformersProvider(selection.model)
}

export const setActiveProvider = async (
  selection: ActiveModelSelection,
  apiKey: string | null
): Promise<void> => {
  const previous = get(activeProviderStore)
  if (previous) {
    await previous.destroy()
  }

  const provider = createProvider(selection)
  await provider.modelInit(selection.providerId === 'groq' ? apiKey : null)
  activeProviderStore.set(provider)
  activeSelectionStore.set(selection)
}

export const resetActiveProvider = async (): Promise<void> => {
  const previous = get(activeProviderStore)
  if (previous) await previous.destroy()
  activeProviderStore.set(null)
  activeSelectionStore.set(null)
}
