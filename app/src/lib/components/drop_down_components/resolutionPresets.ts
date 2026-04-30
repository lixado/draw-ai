export const canvasPresets = [
  { id: 'infinite', label: 'Infinite', width: 0, height: 0 },
  { id: '1024x1024', label: '1024 x 1024', width: 1024, height: 1024 },
  { id: '1536x1536', label: '1536 x 1536', width: 1536, height: 1536 },
  { id: '2048x1536', label: '2048 x 1536', width: 2048, height: 1536 },
  { id: '2732x2048', label: '2732 x 2048', width: 2732, height: 2048 }
] as const

export type CanvasPreset = (typeof canvasPresets)[number]
export type CanvasPresetId = CanvasPreset['id']
