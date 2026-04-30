<script lang="ts">
  import { Infinity as InfinityIcon, Ruler } from 'lucide-svelte'
  import DropDown from './DropDown.svelte'
  import { canvasPresets, type CanvasPreset, type CanvasPresetId } from './resolutionPresets'

  export let open = false
  export let onToggle: () => void
  export let rootEl: HTMLDivElement | null = null
  export let canvasPresetId: CanvasPresetId = 'infinite'
  export let canvasWidth = 0
  export let canvasHeight = 0
  export let canvasPresetsList: readonly CanvasPreset[] = canvasPresets
  export let onCanvasPresetChange: (nextId: CanvasPresetId) => void
</script>

<DropDown
  {open}
  {onToggle}
  pickerClass="canvas-picker"
  buttonClass="nav-icon"
  menuClass="save-dropdown canvas-dropdown"
  menuAlign="left"
  triggerAriaLabel="Canvas size options"
  menuAriaLabel="Canvas size options"
  title="Canvas"
  bind:rootEl
>
  <span slot="trigger"><Ruler size={16} /></span>

  <div class="canvas-current">
    Current:
    {#if canvasPresetId === 'infinite'}
      <span class="infinite-indicator" aria-label="Infinite canvas"><InfinityIcon size={13} /></span>
    {:else}
      {`${canvasWidth} x ${canvasHeight}`}
    {/if}
  </div>
  {#each canvasPresetsList as preset}
    <button class="save-option-btn" type="button" onclick={() => onCanvasPresetChange(preset.id)}>
      {#if preset.id === 'infinite'}
        <span class="infinite-indicator" aria-label="Infinite canvas"><InfinityIcon size={14} /></span>
      {:else}
        {preset.label}
      {/if}
    </button>
  {/each}
</DropDown>
