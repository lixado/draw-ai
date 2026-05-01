<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { prewarmSuggestionModel } from '../ai_old/suggestions'
  import {
    createGroqParameterProvider,
    resetParameterProvider,
    setParameterProvider,
    setProviderWarningHandler
  } from '../ai_old/parameterProvider'
  import { loadProviderMode, saveProviderMode } from '../localstorageManager'

  type ProviderMode = 'local' | 'groq'

  const ENV_GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY ?? '').trim()

  let mode: ProviderMode = 'local'
  let apiKey = ''
  let error = ''
  let showDialog = true
  let showProviderWarning = false
  let providerWarningMessage = ''

  const onProviderWarning = (message: string) => {
    providerWarningMessage = message
    showProviderWarning = true
  }

  const applyProvider = async (nextMode: ProviderMode, nextApiKey?: string) => {
    if (nextMode === 'groq') {
      const key = (nextApiKey ?? apiKey).trim()
      if (!key) {
        showDialog = true
        return false
      }
      apiKey = key
      setParameterProvider(createGroqParameterProvider(key))
      mode = 'groq'
      saveProviderMode('groq', key)
    } else {
      resetParameterProvider()
      mode = 'local'
      saveProviderMode('local')
    }
    await prewarmSuggestionModel()
    return true
  }

  const submit = async () => {
    if (mode === 'groq') {
      const trimmed = apiKey.trim()
      if (!trimmed) {
        error = 'Enter a Groq API key.'
        return
      }
      const applied = await applyProvider('groq', trimmed)
      if (applied) {
        showDialog = false
        error = ''
      }
      return
    }
    const applied = await applyProvider('local')
    if (applied) {
      showDialog = false
      error = ''
    }
  }

  const onProviderDropdownChange = async (event: Event) => {
    const nextMode = (event.currentTarget as HTMLSelectElement).value as ProviderMode
    if (nextMode === 'groq' && !apiKey.trim()) {
      showDialog = true
      return
    }
    await applyProvider(nextMode)
  }

  onMount(() => {
    setProviderWarningHandler(onProviderWarning)
    const providerState = loadProviderMode()
    apiKey = ENV_GROQ_API_KEY || providerState.groqApiKey.trim()

    if (ENV_GROQ_API_KEY) {
      showDialog = false
      void applyProvider('groq', ENV_GROQ_API_KEY)
    } else if (providerState.providerMode === 'groq' && apiKey) {
      showDialog = false
      void applyProvider('groq', apiKey)
    } else {
      showDialog = true
      mode = 'local'
      resetParameterProvider()
    }
  })

  onDestroy(() => {
    setProviderWarningHandler(null)
  })
</script>

{#if showProviderWarning}
  <div class="provider-warning-overlay">
    <div class="provider-warning-card">
      <h2>Model Warning</h2>
      <p>{providerWarningMessage}</p>
      <div class="provider-warning-actions">
        <button
          type="button"
          onclick={async () => {
            showProviderWarning = false
            await applyProvider('local')
          }}
        >
          Switch to Local
        </button>
        <button
          type="button"
          onclick={() => {
            showProviderWarning = false
            showDialog = true
          }}
        >
          New API Key
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showDialog}
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
{/if}

<select
  class="provider-select"
  aria-label="Model provider"
  value={mode}
  onchange={onProviderDropdownChange}
  title="Model provider"
>
  <option value="local">Local</option>
  <option value="groq">Groq</option>
</select>

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

  .provider-select {
    border: 1px solid #d7d7d7;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    padding: 8px 12px;
    color: #0f172a;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .provider-warning-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.48);
    display: grid;
    place-items: center;
    z-index: 35;
  }

  .provider-warning-card {
    width: min(420px, calc(100vw - 32px));
    background: #ffffff;
    border-radius: 14px;
    padding: 16px;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.2);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .provider-warning-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .provider-warning-actions button {
    border: 1px solid #dbe5f0;
    background: #f8fafc;
    color: #0f172a;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
  }
</style>
