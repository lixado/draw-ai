import type { StrokeData } from '../../types'
import {
  getActiveParameterProviderSource,
  listParameterModelClients,
  type ParameterModelClient
} from '../parameterProvider'
import {
  generateParameterSuggestionStrokes,
  type ParameterSuggestionResult
} from '../techniques/parameterGeneration'

type EngineContext = {
  currentStrokes: StrokeData[]
  undoneStrokes: StrokeData[]
}

const pickModelsForRun = (total: number): ParameterModelClient[] => {
  const activeSource = getActiveParameterProviderSource()
  const scoped = listParameterModelClients(activeSource)
  if (scoped.length === 0) return []
  const selected: ParameterModelClient[] = []
  for (let i = 0; i < total; i += 1) {
    selected.push(scoped[i % scoped.length])
  }
  return selected
}

export class SuggestionEngine {
  async generateBatch(context: EngineContext, total: number): Promise<Array<ParameterSuggestionResult & { modelId: string }>> {
    const models = pickModelsForRun(total)
    const runs = models.map(async (model) => {
      const result = await generateParameterSuggestionStrokes(context.currentStrokes, context.undoneStrokes, {
        modelClientId: model.id
      })
      return { ...result, modelId: model.id }
    })
    return Promise.all(runs)
  }

  async generateStream(
    context: EngineContext,
    total: number,
    onEach: (result: (ParameterSuggestionResult & { modelId: string }) & { index: number; total: number }) => Promise<void>
  ): Promise<Array<ParameterSuggestionResult & { modelId: string }>> {
    const models = pickModelsForRun(total)
    const results: Array<ParameterSuggestionResult & { modelId: string }> = []
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i]
      const result = await generateParameterSuggestionStrokes(context.currentStrokes, context.undoneStrokes, {
        modelClientId: model.id
      })
      const item = { ...result, modelId: model.id }
      results.push(item)
      await onEach({ ...item, index: i, total: models.length })
    }
    return results
  }
}

export const suggestionEngine = new SuggestionEngine()
