<script lang="ts">
  import DropDown from './DropDown.svelte'

  export let open = false
  export let onToggle: () => void
  export let rootEl: HTMLDivElement | null = null
  export let selectedColor = '#0f172a'
  export let hue = 0
  export let saturation = 0
  export let value = 0
  export let currentHueColor = '#ff0000'
  export let recentColors: string[] = []
  export let onColorInteraction: () => void = () => {}

  let hueRingEl: HTMLDivElement | null = null
  let svSquareEl: HTMLDivElement | null = null
  let hueDragging = false
  let svDragging = false

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

  const hexToRgb = (hex: string) => {
    const cleaned = hex.replace('#', '')
    const full = cleaned.length === 3 ? cleaned.split('').map((c) => `${c}${c}`).join('') : cleaned
    const num = parseInt(full, 16)
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    }
  }

  const rgbToHsv = (r: number, g: number, b: number) => {
    const rr = r / 255
    const gg = g / 255
    const bb = b / 255
    const max = Math.max(rr, gg, bb)
    const min = Math.min(rr, gg, bb)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
      if (max === rr) h = 60 * (((gg - bb) / delta) % 6)
      else if (max === gg) h = 60 * ((bb - rr) / delta + 2)
      else h = 60 * ((rr - gg) / delta + 4)
    }
    if (h < 0) h += 360
    const s = max === 0 ? 0 : delta / max
    const v = max
    return { h, s, v }
  }

  const updateHueFromPointer = (event: PointerEvent) => {
    if (!hueRingEl) return
    const rect = hueRingEl.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = event.clientX - cx
    const dy = event.clientY - cy
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (deg < 0) deg += 360
    hue = deg
    onColorInteraction()
  }

  const updateSvFromPointer = (event: PointerEvent) => {
    if (!svSquareEl) return
    const rect = svSquareEl.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, rect.width)
    const y = clamp(event.clientY - rect.top, 0, rect.height)
    saturation = clamp(x / rect.width, 0, 1)
    value = clamp(1 - y / rect.height, 0, 1)
    onColorInteraction()
  }

  const onHuePointerDown = (event: PointerEvent) => {
    hueDragging = true
    updateHueFromPointer(event)
  }

  const onSvPointerDown = (event: PointerEvent) => {
    event.stopPropagation()
    svDragging = true
    updateSvFromPointer(event)
  }

  const onWindowPointerMove = (event: PointerEvent) => {
    if (hueDragging) updateHueFromPointer(event)
    if (svDragging) updateSvFromPointer(event)
  }

  const onWindowPointerUp = () => {
    hueDragging = false
    svDragging = false
  }

  const applyRecentColor = (color: string) => {
    const rgb = hexToRgb(color)
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
    hue = hsv.h
    saturation = hsv.s
    value = hsv.v
    onColorInteraction()
  }
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<DropDown
  {open}
  {onToggle}
  pickerClass="color-picker"
  buttonClass="color-swatch"
  menuClass="color-dropdown"
  triggerAriaLabel="Selected color"
  menuAriaLabel="Choose color"
  menuAlign="right"
  buttonStyle={`background:${selectedColor}`}
  bind:rootEl
>
  <div
    class="wheel"
    bind:this={hueRingEl}
    onpointerdown={onHuePointerDown}
    role="slider"
    tabindex="0"
    aria-label="Base hue"
    aria-valuemin={0}
    aria-valuemax={360}
    aria-valuenow={Math.round(hue)}
  >
    <div
      class="wheel-marker"
      style={`left:${50 + Math.cos(((hue - 90) * Math.PI) / 180) * 44}%; top:${50 + Math.sin(((hue - 90) * Math.PI) / 180) * 44}%;`}
    ></div>
    <div
      class="wheel-inner"
      style={`background:${currentHueColor}`}
      bind:this={svSquareEl}
      onpointerdown={onSvPointerDown}
      role="slider"
      tabindex="0"
      aria-label="Color brightness and saturation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div class="sv-layer white"></div>
      <div class="sv-layer black"></div>
      <div class="sv-cursor" style={`left:${saturation * 100}%; top:${(1 - value) * 100}%;`}></div>
    </div>
  </div>

  {#if recentColors.length > 0}
    <div class="dots">
      {#each recentColors as color}
        <button
          class="dot"
          type="button"
          onclick={() => applyRecentColor(color)}
          style={`background:${color}`}
          aria-label={`Recent color ${color}`}
        ></button>
      {/each}
    </div>
  {/if}
</DropDown>
