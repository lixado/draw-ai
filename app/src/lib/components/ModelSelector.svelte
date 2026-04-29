<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  type Selection =
    | { mode: 'local' }
    | { mode: 'groq'; apiKey: string }

  export let initialMode: 'local' | 'groq' = 'local'
  export let initialApiKey = ''

  let mode: 'local' | 'groq' = initialMode
  let apiKey = initialApiKey
  let error = ''

  const dispatch = createEventDispatcher<{ select: Selection }>()

  const submit = () => {
    if (mode === 'groq') {
      const trimmed = apiKey.trim()
      if (!trimmed) {
        error = 'Enter a Groq API key.'
        return
      }
      dispatch('select', { mode: 'groq', apiKey: trimmed })
      return
    }
    dispatch('select', { mode: 'local' })
  }
</script>

<div class="overlay">
  <div class="card">
    <h2>Choose Model Provider</h2>
    <p>Pick local model or use Groq with your API key.</p>

    <div class="options">
      <button class:active={mode === 'local'} type="button" onclick={() => (mode = 'local')}>Local model</button>
      <button class:active={mode === 'groq'} type="button" onclick={() => (mode = 'groq')}>
        Groq API
      </button>
    </div>

    {#if mode === 'groq' && apiKey.trim().length === 0}
      <label for="apiKey">Groq API key <a href="https://console.groq.com/keys" target="_blank">Get API key for FREE!</a></label>
      <input
        type="password"
        placeholder="Paste Groq API key"
        bind:value={apiKey}
        id="apiKey"
        oninput={() => (error = '')}
      />
    {:else if mode === 'groq' && apiKey.trim().length > 0}
      <p>API key: {apiKey.trim().slice(0, 4)}...{apiKey.trim().slice(-4)}</p>
    {/if}

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <button class="confirm" type="button" onclick={submit}>Continue</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    display: grid;
    place-items: center;
    z-index: 30;
  }

  .card {
    width: min(460px, calc(100vw - 32px));
    background: #ffffff;
    border-radius: 14px;
    padding: 16px;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.22);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: #64748b;
    font-size: 0.9rem;
  }

  .options {
    display: flex;
    gap: 8px;
  }

  .options button,
  .confirm {
    border: 1px solid #dbe5f0;
    background: #f8fafc;
    color: #0f172a;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .options button.active {
    border-color: #2563eb;
    background: #dbeafe;
  }

  input {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
  }

  .error {
    color: #b91c1c;
    font-size: 0.84rem;
  }

  .confirm {
    align-self: flex-end;
    background: #2563eb;
    color: #ffffff;
    border-color: #2563eb;
  }
</style>
