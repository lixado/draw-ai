<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import getStroke from 'perfect-freehand'
  import type { BrushStyle, StrokeData, StrokePoint } from '../types'

  export let brushSize: number = 6
  export let brushColor: string = '#0f172a'
  export let brushOpacity: number = 1
  export let toolMode: 'draw' | 'erase' = 'draw'
  export let brushStyle: BrushStyle = 'ink'
  export let activeLayerId: string = 'layer-1'
  export let canvasWidth: number = 2048
  export let canvasHeight: number = 1536

  export let strokes: StrokeData[] = []

  const dispatch = createEventDispatcher<{
    addstroke: StrokeData
    penDoubleTapUndo: void
  }>()

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  let drawingPoints: StrokePoint[] = []
  let pointerDown = false
  let dpr = window.devicePixelRatio || 1
  let lastTapTime = 0
  let lastTapX = 0
  let lastTapY = 0
  let lastSampleX = 0
  let lastSampleY = 0
  let lastSampleTime = 0
  let viewScale = 1
  let viewOffsetX = 0
  let viewOffsetY = 0
  const touchPoints = new Map<number, { x: number; y: number }>()
  let activePenPointerId: number | null = null
  let pinchPrevDistance = 0
  let pinchPrevMidX = 0
  let pinchPrevMidY = 0
  const MIN_SCALE = 0.25
  const MAX_SCALE = 8
  let frameRequested = false

  const resize = () => {
    if (!canvas || !canvas.parentElement) return
    const bounds = canvas.parentElement.getBoundingClientRect()
    canvas.width = Math.floor(bounds.width * dpr)
    canvas.height = Math.floor(bounds.height * dpr)
    canvas.style.width = `${bounds.width}px`
    canvas.style.height = `${bounds.height}px`
    render()
  }

  const clampScale = (next: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))

  const scheduleRender = () => {
    if (frameRequested) return
    frameRequested = true
    requestAnimationFrame(() => {
      frameRequested = false
      render()
    })
  }

  const getViewportTransform = () => {
    if (!canvas) return { baseScale: 1, baseOffsetX: 0, baseOffsetY: 0 }
    if (canvasWidth <= 0 || canvasHeight <= 0) return { baseScale: 1, baseOffsetX: 0, baseOffsetY: 0 }
    const rect = canvas.getBoundingClientRect()
    const safeWidth = Math.max(1, canvasWidth)
    const safeHeight = Math.max(1, canvasHeight)
    const baseScale = Math.min(rect.width / safeWidth, rect.height / safeHeight)
    const baseOffsetX = (rect.width - safeWidth * baseScale) / 2
    const baseOffsetY = (rect.height - safeHeight * baseScale) / 2
    return { baseScale, baseOffsetX, baseOffsetY }
  }

  const zoomAt = (screenX: number, screenY: number, nextScaleRaw: number) => {
    const nextScale = clampScale(nextScaleRaw)
    const worldX = (screenX - viewOffsetX) / viewScale
    const worldY = (screenY - viewOffsetY) / viewScale
    viewScale = nextScale
    viewOffsetX = screenX - worldX * viewScale
    viewOffsetY = screenY - worldY * viewScale
  }

  const getPathFromStroke = (points: number[][]) => {
    if (!points.length) return ''
    const [first, ...rest] = points
    return rest.reduce((acc, [x, y], i, arr) => {
      const [nextX, nextY] = arr[(i + 1) % arr.length]
      acc.push(`Q${x},${y} ${(x + nextX) / 2},${(y + nextY) / 2}`)
      return acc
    }, [`M${first[0]},${first[1]}`]).join(' ')
  }

  const brushStyleOptions: Record<BrushStyle, Parameters<typeof getStroke>[1]> = {
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
  }

  const toSyntheticPressure = (event: PointerEvent, x: number, y: number): number => {
    // 1) Raw device pressure. Pens provide this natively; touch often reports 0.
    const rawPressure = event.pressure > 0 ? event.pressure : 0.35

    // 2) Tilt factor. More tilt means broader "side shading" feel.
    const tiltX = Math.abs(event.tiltX || 0)
    const tiltY = Math.abs(event.tiltY || 0)
    const tiltFactor = Math.max(tiltX, tiltY) / 90

    // 3) Velocity thinning. Faster movement makes line slightly thinner.
    let velocityThinning = 0
    if (lastSampleTime > 0) {
      const dt = Math.max(1, event.timeStamp - lastSampleTime)
      const dist = Math.hypot(x - lastSampleX, y - lastSampleY)
      const speed = dist / dt
      velocityThinning = Math.min(speed * 0.22, 0.25)
    }

    const weighted = rawPressure * 0.78 + tiltFactor * 0.22
    const synthetic = weighted - velocityThinning
    return Math.max(0.14, Math.min(1, synthetic))
  }

  const drawStroke = (stroke: StrokeData) => {
    if (!ctx) return
    const style = stroke.style ?? brushStyle
    const options = brushStyleOptions[style] ?? brushStyleOptions.ink
    const outline = getStroke(stroke.points, {
      size: stroke.size,
      ...options
    })
    const pathData = getPathFromStroke(outline)
    if (!pathData) return

    const p = new Path2D(pathData)
    ctx.save()
    const alpha = typeof stroke.opacity === 'number' ? stroke.opacity : brushOpacity
    if (stroke.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = alpha
      // Color doesn't matter for destination-out, but must be non-transparent.
      ctx.fillStyle = '#000000'
      ctx.fill(p)
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = alpha
      ctx.fillStyle = stroke.color
      ctx.fill(p)
    }
    ctx.restore()
  }

  const render = () => {
    if (!ctx || !canvas) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const { baseScale, baseOffsetX, baseOffsetY } = getViewportTransform()
    ctx.scale(dpr, dpr)
    ctx.translate(baseOffsetX + viewOffsetX, baseOffsetY + viewOffsetY)
    ctx.scale(baseScale * viewScale, baseScale * viewScale)
    if (canvasWidth > 0 && canvasHeight > 0) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1 / Math.max(1, baseScale * viewScale)
      ctx.strokeRect(0, 0, canvasWidth, canvasHeight)
    }
    for (const stroke of strokes) {
      drawStroke(stroke)
    }
    if (drawingPoints.length > 1) {
      drawStroke({
        id: 'preview',
        points: drawingPoints,
        size: brushSize,
        color: brushColor,
        opacity: brushOpacity,
        mode: toolMode,
        style: brushStyle,
        layerId: activeLayerId
      })
    }
  }

  const toCanvasPoint = (event: PointerEvent): StrokePoint => {
    const rect = canvas.getBoundingClientRect()
    const { baseScale, baseOffsetX, baseOffsetY } = getViewportTransform()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const scale = Math.max(0.0001, baseScale * viewScale)
    const x = (sx - baseOffsetX - viewOffsetX) / scale
    const y = (sy - baseOffsetY - viewOffsetY) / scale
    const pressure = toSyntheticPressure(event, x, y)
    lastSampleX = x
    lastSampleY = y
    lastSampleTime = event.timeStamp
    return [x, y, pressure]
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'pen') activePenPointerId = event.pointerId
    if (event.pointerType === 'touch' && activePenPointerId !== null) return
    if (event.pointerType === 'touch') {
      const rect = canvas.getBoundingClientRect()
      touchPoints.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
      if (touchPoints.size >= 2) {
        const [a, b] = Array.from(touchPoints.values())
        pinchPrevDistance = Math.hypot(b.x - a.x, b.y - a.y)
        pinchPrevMidX = (a.x + b.x) / 2
        pinchPrevMidY = (a.y + b.y) / 2
        // Stop an in-progress stroke when entering gesture mode.
        pointerDown = false
        drawingPoints = []
        scheduleRender()
        return
      }
    }

    canvas.setPointerCapture(event.pointerId)
    pointerDown = true
    const start = toCanvasPoint(event)
    lastSampleX = start[0]
    lastSampleY = start[1]
    lastSampleTime = event.timeStamp
    drawingPoints = [start]
    scheduleRender()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && activePenPointerId !== null) return
    if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
      const rect = canvas.getBoundingClientRect()
      touchPoints.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
      if (touchPoints.size >= 2) {
        const [a, b] = Array.from(touchPoints.values())
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        const dist = Math.hypot(b.x - a.x, b.y - a.y)
        if (pinchPrevDistance > 0) {
          const scaleFactor = dist / pinchPrevDistance
          zoomAt(midX, midY, viewScale * scaleFactor)
        }
        // Two-finger pan.
        viewOffsetX += midX - pinchPrevMidX
        viewOffsetY += midY - pinchPrevMidY
        pinchPrevDistance = dist
        pinchPrevMidX = midX
        pinchPrevMidY = midY
        scheduleRender()
        return
      }
    }

    if (!pointerDown) return
    const batch = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    const points =
      batch.length > 0 ? batch.map((coalesced) => toCanvasPoint(coalesced as PointerEvent)) : [toCanvasPoint(event)]
    drawingPoints = [...drawingPoints, ...points]
    scheduleRender()
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'pen' && activePenPointerId === event.pointerId) activePenPointerId = null
    if (event.pointerType === 'touch') {
      touchPoints.delete(event.pointerId)
      if (touchPoints.size < 2) {
        pinchPrevDistance = 0
      }
      if (!pointerDown) {
        return
      }
    }

    if (!pointerDown) return
    pointerDown = false
    const tapNow = Date.now()
    const [x, y] = toCanvasPoint(event)
    const dist = Math.hypot(x - lastTapX, y - lastTapY)
    if (event.pointerType === 'pen' && tapNow - lastTapTime < 320 && dist < 22) {
      dispatch('penDoubleTapUndo')
    }
    lastTapTime = tapNow
    lastTapX = x
    lastTapY = y
    lastSampleTime = 0

    if (drawingPoints.length > 1) {
      dispatch('addstroke', {
        id: crypto.randomUUID(),
        points: drawingPoints,
        size: brushSize,
        color: brushColor,
        opacity: brushOpacity,
        mode: toolMode,
        style: brushStyle,
        layerId: activeLayerId
      })
    }
    drawingPoints = []
    scheduleRender()
  }

  $: if (strokes) {
    scheduleRender()
  }

  $: if (drawingPoints) {
    scheduleRender()
  }

  $: if (brushColor || brushSize || brushOpacity || brushStyle || toolMode || canvasWidth || canvasHeight) {
    scheduleRender()
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const factor = Math.exp(-event.deltaY * 0.0015)
    zoomAt(sx, sy, viewScale * factor)
    scheduleRender()
  }

  export const getPngDataUrl = (): string => {
    if (!canvas) return ''
    return canvas.toDataURL('image/png')
  }

  onMount(() => {
    ctx = canvas.getContext('2d')
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  })
</script>

<div class="canvas-wrap">
  <canvas
    bind:this={canvas}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
  ></canvas>
</div>

<style>
  .canvas-wrap {
    border: none;
    border-radius: 0;
    background: #ffffff;
    overflow: hidden;
    min-height: 0;
    height: 100%;
    width: 100%;
    flex: 1;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    background: #ffffff;
  }
</style>
