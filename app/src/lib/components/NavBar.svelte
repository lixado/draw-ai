<script lang="ts">
  import { Eraser, Expand, RotateCcw, RotateCw, Trash2 } from 'lucide-svelte'
  import logoUrl from '../../assets/logo.png'
  import BrushSelector from './drop_down_components/BrushSelector.svelte'
  import ColorDropDown from './drop_down_components/ColorDropDown.svelte'
  import LayerDropDown from './drop_down_components/LayerDropDown.svelte'
  import ModelSelector from './ModelSelector.svelte'
  import ResolutionDropDown from './drop_down_components/ResolutionDropDown.svelte'
  import SaveDropDown from './drop_down_components/SaveDropDown.svelte'
  import { brushStyleOptions } from '../brush/brushStyleOptions'
  import type { BrushStyle, LayerData, StrokeData } from '../types'

  export let isIPad = false
  export let strokes: StrokeData[] = []
  export let visibleStrokes: StrokeData[] = []
  export let undoneStack: StrokeData[] = []
  export let undoneContext: StrokeData[] = []
  export let layers: LayerData[] = []
  export let visibleLayerIds: string[] = []
  export let activeLayerId = 'layer-1'
  export let toolMode: 'draw' | 'erase' = 'draw'
  export let brushStyle: BrushStyle = 'ribbon'
  export let brushColor = '#0f172a'
  export let brushOpacity = 1
  export let hue = 0
  export let saturation = 0
  export let value = 0
  export let currentHueColor = '#ff0000'
  export let recentColors: string[] = []
  export let canvasPresetId: 'infinite' | '1024x1024' | '1536x1536' | '2048x1536' | '2732x2048' = 'infinite'
  export let canvasWidth = 0
  export let canvasHeight = 0
  export let drawingCanvasRef: { getPngDataUrl?: () => string } | null = null
  export let clearUndoSnapshot:
    | {
        strokes: StrokeData[]
        layers: LayerData[]
        activeLayerId: string
        visibleLayerIds: string[]
      }
    | null = null

  export let onUndo: () => void
  export let onRedo: () => void
  export let onClear: () => void
  export let onEnterFullscreen: () => void
  export let onExitEraseMode: () => void

  let isColorMenuOpen = false
  let isBrushMenuOpen = false
  let isSaveMenuOpen = false
  let isCanvasMenuOpen = false
  let showLayerMenu = false

  let colorMenuRoot: HTMLDivElement | null = null
  let brushMenuRoot: HTMLDivElement | null = null
  let saveMenuRoot: HTMLDivElement | null = null
  let canvasMenuRoot: HTMLDivElement | null = null
  let layerMenuRoot: HTMLDivElement | null = null

  const closeAllMenus = () => {
    isColorMenuOpen = false
    isBrushMenuOpen = false
    isSaveMenuOpen = false
    isCanvasMenuOpen = false
    showLayerMenu = false
  }

  const onWindowPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null
    if (isColorMenuOpen) {
      const colorRoot = colorMenuRoot
      if (colorRoot && target && colorRoot.contains(target)) return
      isColorMenuOpen = false
    }
    if (isBrushMenuOpen) {
      const brushRoot = brushMenuRoot
      if (brushRoot && target && brushRoot.contains(target)) return
      isBrushMenuOpen = false
    }
    if (isSaveMenuOpen) {
      const saveRoot = saveMenuRoot
      if (saveRoot && target && saveRoot.contains(target)) return
      isSaveMenuOpen = false
    }
    if (isCanvasMenuOpen) {
      const canvasRoot = canvasMenuRoot
      if (canvasRoot && target && canvasRoot.contains(target)) return
      isCanvasMenuOpen = false
    }
    if (showLayerMenu) {
      const layerRoot = layerMenuRoot
      if (layerRoot && target && layerRoot.contains(target)) return
      showLayerMenu = false
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<header class="navbar" aria-label="Top toolbar">
  <div class="nav-left">
    <button
      class="nav-icon"
      type="button"
      onclick={onUndo}
      disabled={strokes.length === 0 && !clearUndoSnapshot}
      aria-label="Undo"
      title="Undo"
    >
      <RotateCcw size={16} />
    </button>
    <button
      class="nav-icon"
      type="button"
      onclick={onRedo}
      disabled={undoneStack.length === 0}
      aria-label="Redo last"
      title="Redo"
    >
      <RotateCw size={16} />
    </button>
    <button
      class="nav-icon"
      type="button"
      class:active={toolMode === 'erase'}
      onclick={() => (toolMode = toolMode === 'erase' ? 'draw' : 'erase')}
      aria-label="Eraser"
      aria-pressed={toolMode === 'erase'}
      title="Eraser"
    >
      <Eraser size={16} />
    </button>
    {#if isIPad}
      <button
        class="nav-icon"
        type="button"
        onclick={onEnterFullscreen}
        aria-label="Fullscreen"
        title="Fullscreen"
      >
        <Expand size={16} />
      </button>
    {/if}
    <button class="nav-icon dangerText" type="button" onclick={onClear} aria-label="Clear all" title="Clear">
      <Trash2 size={16} />
    </button>
    <SaveDropDown
      open={isSaveMenuOpen}
      onToggle={() => {
        const nextOpen = !isSaveMenuOpen
        closeAllMenus()
        isSaveMenuOpen = nextOpen
      }}
      onClose={() => (isSaveMenuOpen = false)}
      {drawingCanvasRef}
      {strokes}
      {layers}
      {visibleStrokes}
      {brushStyleOptions}
      bind:rootEl={saveMenuRoot}
    />
    <ResolutionDropDown
      open={isCanvasMenuOpen}
      onToggle={() => {
        const nextOpen = !isCanvasMenuOpen
        closeAllMenus()
        isCanvasMenuOpen = nextOpen
      }}
      bind:rootEl={canvasMenuRoot}
      bind:strokes
      bind:undoneStack
      bind:undoneContext
      bind:clearUndoSnapshot
      bind:canvasPresetId
      bind:canvasWidth
      bind:canvasHeight
    />
    <ModelSelector />
  </div>

  <div class="nav-title" aria-hidden="true">
    <img class="nav-title-icon" src={logoUrl} alt="" />
    <span>DrawAI</span>
  </div>

  <div class="nav-right">
    <LayerDropDown
      open={showLayerMenu}
      onToggle={() => {
        const nextOpen = !showLayerMenu
        closeAllMenus()
        showLayerMenu = nextOpen
      }}
      bind:rootEl={layerMenuRoot}
      bind:layers
      bind:visibleLayerIds
      {strokes}
      {brushStyleOptions}
      bind:activeLayerId
    />
    <ColorDropDown
      open={isColorMenuOpen}
      onToggle={() => {
        const nextOpen = !isColorMenuOpen
        closeAllMenus()
        isColorMenuOpen = nextOpen
      }}
      bind:rootEl={colorMenuRoot}
      selectedColor={brushColor}
      bind:hue
      bind:saturation
      bind:value
      {currentHueColor}
      {recentColors}
      onColorInteraction={onExitEraseMode}
    />

    <div bind:this={brushMenuRoot}>
      <BrushSelector
        value={brushStyle}
        open={isBrushMenuOpen}
        onToggle={() => {
          const nextOpen = !isBrushMenuOpen
          closeAllMenus()
          isBrushMenuOpen = nextOpen
        }}
        onPick={(id) => {
          brushStyle = id
          onExitEraseMode()
          isBrushMenuOpen = false
        }}
      />
    </div>
  </div>
</header>
