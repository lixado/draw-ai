import type { BrushStyle } from '../types'

export const brushStyleOptions = {
  pencil: {
    thinning: 0.85,
    smoothing: 0.45,
    streamline: 0.2,
    simulatePressure: false,
    easing: (t: number) => t * (2 - t)
  },
  ink: {
    thinning: 0.65,
    smoothing: 0.65,
    streamline: 0.4,
    simulatePressure: false,
    easing: (t: number) => t * t
  },
  marker: {
    thinning: 0.2,
    smoothing: 0.8,
    streamline: 0.55,
    simulatePressure: false,
    easing: (t: number) => t * (2 - t)
  },
  airbrush: {
    thinning: 0.1,
    smoothing: 0.9,
    streamline: 0.65,
    simulatePressure: true
  },
  calligraphy: {
    thinning: 0.95,
    smoothing: 0.45,
    streamline: 0.25,
    simulatePressure: false
  },
  watercolor: {
    thinning: 0.4,
    smoothing: 0.85,
    streamline: 0.5,
    simulatePressure: true
  },
  charcoal: {
    thinning: 0.75,
    smoothing: 0.35,
    streamline: 0.15,
    simulatePressure: true
  },
  neon: {
    thinning: 0.55,
    smoothing: 0.7,
    streamline: 0.5,
    simulatePressure: false
  },
  pixel: {
    thinning: 0,
    smoothing: 0,
    streamline: 0,
    simulatePressure: false
  },
  ribbon: {
    thinning: 0.8,
    smoothing: 0.78,
    streamline: 0.68,
    simulatePressure: true
  }
} as const satisfies Record<BrushStyle, Parameters<typeof import('perfect-freehand').default>[1]>
