export type StrokePoint = [number, number, number]

export type StrokeMode = 'draw' | 'erase'
export type BrushStyle = 'pencil' | 'ink' | 'marker'

export type StrokeData = {
  id: string
  points: StrokePoint[]
  size: number
  color: string
  opacity: number
  mode: StrokeMode
  style: BrushStyle
}
