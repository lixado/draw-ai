import type { StrokeData } from "../../types";
import { getActiveModelSelection, getActiveProvider } from "../providers/activeProvider";

export type RedoSuggestion = {
  id: string
  strokes: StrokeData[]
}

type SuggestionResult = {
  modelStatus: 'idle' | 'ready'
  suggestions: RedoSuggestion[]
}

type SuggestionStreamHandlers = {
  onSuggestion: (suggestion: RedoSuggestion) => void | Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const REDO_SYSTEM_PROMPT = `You are a digital painting app assistant.`

const buildRedoUserPrompt = (strokes: StrokeData[]) =>
  ``


export const generateUndoSuggestionsStreamNew = async (
  undoneStrokes: StrokeData[],
  _currentStrokes: StrokeData[],
  handlers: SuggestionStreamHandlers
): Promise<SuggestionResult> => {
  const suggestions: RedoSuggestion[] = []

  // check if current model supports image input or not
  const selection = getActiveModelSelection()
  const modelId = selection?.model ?? ''
  const supportsVision = selection?.providerId === 'groq' && modelId === 'meta-llama/llama-4-scout-17b-16e-instruct'

  for (let i = 0; i < undoneStrokes.length; i += 1) {
    if (i > 0) await wait(1000)
    const stroke = undoneStrokes[i]
    const suggestion: RedoSuggestion = {
      id: stroke.id,
      strokes: [stroke]
    }
    suggestions.push(suggestion)
    await handlers.onSuggestion(suggestion)
  }

  return {
    modelStatus: 'ready',
    suggestions
  }
}