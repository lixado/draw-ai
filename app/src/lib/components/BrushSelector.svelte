<script lang="ts">
  import type { BrushStyle } from '../types'

  export let value: BrushStyle
  export let open = false
  export let options: Array<{ id: BrushStyle; label: string; preview: string }> = []

  export let onToggle: () => void
  export let onPick: (id: BrushStyle) => void
</script>

<div class="picker brush-picker">
  <button type="button" class="brush-swatch" aria-label="Selected brush style" aria-expanded={open} onclick={onToggle}>
    Brush
  </button>

  {#if open}
    <div class="brush-dropdown" role="menu" aria-label="Choose brush">
      <div class="brush-styles" role="list">
        {#each options as option}
          <button
            type="button"
            class="brush-style-btn"
            aria-label={`Brush style ${option.label}`}
            onclick={() => onPick(option.id)}
            aria-pressed={value === option.id}
          >
            <span class="brush-preview">{option.preview}</span>
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
