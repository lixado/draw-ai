import { getSuggestionTextGenerator, prewarmSuggestionTextGenerator } from './modelLoad'
import type { ParameterCandidate, ParameterModelClient, ParameterProviderContext } from '../../parameterProvider'

type CreateLocalClientDeps = {
  buildPrompt: (context: ParameterProviderContext) => string
  parseJson: (text: string) => ParameterCandidate | null
}

export const createLocalParameterClient = (
  model: string,
  deps: CreateLocalClientDeps
): ParameterModelClient => ({
  id: `local:${model}`,
  source: 'local',
  label: model,
  generate: async (context) => {
    const generator = await getSuggestionTextGenerator(model)
    if (!generator) return null
    const prompt = deps.buildPrompt(context)
    try {
      const out = await generator(prompt, { max_new_tokens: 32, temperature: 0.25 })
      const text = out?.[0]?.generated_text ?? ''
      return deps.parseJson(text)
    } catch {
      return null
    }
  },
  prewarm: async () => {
    await prewarmSuggestionTextGenerator(model)
  }
})
