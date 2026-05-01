<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Bot } from 'lucide-svelte'

  export let paletteSuggestions: string[] = []

  const dispatch = createEventDispatcher<{ pick: string }>()
</script>

{#if paletteSuggestions.length > 0}
  <section class="palette-panel">
    <header>
      <h2><Bot size={13} /> AI Palette</h2>
    </header>
    <div class="dots">
      {#each paletteSuggestions as color}
        <button
          class="dot"
          type="button"
          style={`background:${color}`}
          onclick={() => dispatch('pick', color)}
          aria-label={`Palette color ${color}`}
        ></button>
      {/each}
    </div>
  </section>
{/if}
