export type StrokePoint = [number, number, number]

export type StrokeMode = 'draw' | 'erase'
export type BrushStyle =
  | 'pencil'
  | 'ink'
  | 'marker'
  | 'airbrush'
  | 'calligraphy'
  | 'watercolor'
  | 'charcoal'
  | 'neon'
  | 'pixel'
  | 'ribbon'

export type StrokeStack = StrokeData[]

export type LayerData = {
  id: string
  name: string
  visible: boolean
}

export type StrokeData = {
  id: string
  points: StrokePoint[]
  size: number
  color: string
  opacity: number
  mode: StrokeMode
  style: BrushStyle
  layerId: string
}
