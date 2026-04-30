<script lang="ts">
  import { tick } from 'svelte'

  export let open = false
  export let onToggle: () => void
  export let pickerClass = ''
  export let buttonClass = ''
  export let menuClass = ''
  export let buttonStyle = ''
  export let triggerAriaLabel = 'Open dropdown'
  export let menuAriaLabel = 'Dropdown menu'
  export let title = ''
  export let rootEl: HTMLDivElement | null = null
  export let pointerX: string | null = null
  export let menuAlign: 'center' | 'left' | 'right' = 'center'

  let triggerEl: HTMLButtonElement | null = null
  let pointerLeftPx = 0

  const updatePointer = async () => {
    if (!open) return
    await tick()
    await tick()
    if (!triggerEl) return
    pointerLeftPx = triggerEl.offsetLeft + triggerEl.offsetWidth / 2
  }

  $: if (open) void updatePointer()
</script>

<div
  class={`picker ${pickerClass}`.trim()}
  style="--dropdown-pointer-margin-top: 8px;"
  bind:this={rootEl}
>
  <button
    type="button"
    class={buttonClass}
    style={buttonStyle || undefined}
    aria-label={triggerAriaLabel}
    aria-expanded={open}
    onclick={onToggle}
    {title}
    bind:this={triggerEl}
  >
    <slot name="trigger" />
  </button>

  {#if open}
    <div
      class="dropdown-pointer"
      style={`left:${pointerX ?? `${pointerLeftPx}px`};`}
    ></div>
    <div
      class={`${menuClass} dropdown-surface dropdown-align-${menuAlign}`.trim()}
      role="menu"
      aria-label={menuAriaLabel}
    >
      <slot />
    </div>
  {/if}
</div>

<style>

  .dropdown-pointer {
    position: absolute;
    top: 100%;
    margin-top: var(--dropdown-pointer-margin-top, 8px);
    z-index: 101;
    width: 16px;
    height: 16px;
    background: rgba(146, 82, 50, 0.94);
    border-radius: 50% 50% 0 50%;
    transform: translateX(-50%) rotate(225deg);
    box-shadow: 0 2px 6px rgba(67, 36, 20, 0.3);
    pointer-events: none;
  }

  :global(.dropdown-surface) {
    position: absolute;
    top: 100%;
    margin-top: calc(var(--dropdown-pointer-margin-top) + 12px);
    z-index: 100;
    background: rgba(146, 82, 50, 0.94) !important;
    border: 0 !important;
    box-shadow: 0 12px 24px rgba(67, 36, 20, 0.34);
    backdrop-filter: blur(6px);
  }

  :global(.dropdown-surface.dropdown-align-center) {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
  }

  :global(.dropdown-surface.dropdown-align-left) {
    left: 0;
    right: auto;
    transform: none;
  }

  :global(.dropdown-surface.dropdown-align-right) {
    left: auto;
    right: 0;
    transform: none;
  }
</style>
