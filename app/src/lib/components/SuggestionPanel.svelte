<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Bot, LoaderCircle, Square } from 'lucide-svelte'
  import type { RedoSuggestion } from '../ai/suggestions'

  export let suggestions: RedoSuggestion[] = []
  export let loadingSuggestions = false
  export let modelStatus = 'idle'

  const dispatch = createEventDispatcher<{ pick: RedoSuggestion; stop: void }>()
</script>

<aside class="panel">
  <header>
    <h2><Bot size={14} /> Redo</h2>
    {#if loadingSuggestions}
      <div class="status-row">
        <span class="spin"><LoaderCircle size={14} /></span>
        <button class="stop-btn" type="button" onclick={() => dispatch('stop')} aria-label="Stop generation">
          <Square size={11} />
        </button>
      </div>
    {:else}
      <span>{modelStatus}</span>
    {/if}
  </header>
  {#if suggestions.length === 0}
    {#if loadingSuggestions}
      <p class="hint">Preparing redo options...</p>
    {:else}
      <p class="hint">Undo a stroke to get 3 options.</p>
    {/if}
  {:else}
    <div class="grid" role="list">
      {#each suggestions as suggestion (suggestion.id)}
        <button class="tile" type="button" onclick={() => dispatch('pick', suggestion)}>
          <img class="thumb" src={suggestion.previewUrl} alt="" />
        </button>
      {/each}
    </div>
    {#if loadingSuggestions}
      <p class="hint">Generating more options...</p>
    {/if}
  {/if}
</aside>

<style>
  .panel {
    background: #ffffff;
    border: 1px solid #dbe5f0;
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  h2 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 0.96rem;
  }

  .status-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  .stop-btn {
    width: 20px;
    height: 20px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #334155;
  }

  header span {
    font-size: 0.75rem;
    color: #64748b;
    text-transform: capitalize;
  }

  .hint {
    color: #64748b;
    font-size: 0.86rem;
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tile {
    border: 1px solid #dbe5f0;
    background: #f8fafc;
    border-radius: 12px;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    aspect-ratio: 16 / 9;
  }

  .tile:active {
    transform: translateY(1px);
  }

  .thumb {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    pointer-events: none;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
