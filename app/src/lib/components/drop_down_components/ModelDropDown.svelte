<script lang="ts">
  import { Bot } from 'lucide-svelte'
  import { onMount } from 'svelte'
  import modelsConfig from '../../ai/providers/models.json'
  import { setActiveProvider, type ProviderId } from '../../ai/providers/activeProvider'
  import { loadProviderMode, saveModelId, saveProviderMode } from '../../localstorageManager'
  import DropDown from './DropDown.svelte'

  export let open = false
  export let onToggle: () => void
  export let rootEl: HTMLDivElement | null = null

  type ProviderOption = {
    id: ProviderId
    models: string[]
  }

  const ENV_GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY ?? '').trim()
  const providers = (modelsConfig.providers ?? []) as ProviderOption[]

  let mode: ProviderId = 'local'
  let selectedModel = ''
  let apiKey = ''
  let error = ''

  const getDefaultModel = (providerId: ProviderId) => {
    const provider = providers.find((item) => item.id === providerId)
    return provider?.models[0] ?? ''
  }

  const requiresApiKey = (providerId: ProviderId) => providerId === 'groq'

  const applyProvider = async (nextMode: ProviderId, nextModel: string, nextApiKey?: string) => {
    const model = nextModel || getDefaultModel(nextMode)
    if (!model) {
      error = 'No model configured for this provider.'
      return false
    }

    let keyToUse = (nextApiKey ?? apiKey).trim()
    if (nextMode === 'groq') {
      if (!keyToUse) {
        error = 'Enter a Groq API key.'
        return false
      }
      apiKey = keyToUse
      saveProviderMode('groq', keyToUse)
    } else {
      saveProviderMode('local')
      keyToUse = ''
    }

    await setActiveProvider({ providerId: nextMode, model }, keyToUse || null)
    mode = nextMode
    selectedModel = model
    saveModelId(model)
    error = ''
    return true
  }

  onMount(() => {
    const providerState = loadProviderMode()
    apiKey = (ENV_GROQ_API_KEY || providerState.groqApiKey).trim()
    const savedMode =
      providerState.providerMode === 'groq' || providerState.providerMode === 'local'
        ? providerState.providerMode
        : 'local'
    mode = savedMode
    selectedModel = providerState.modelId || getDefaultModel(mode)
    if (!selectedModel) selectedModel = getDefaultModel('local')
    if (requiresApiKey(mode) && !apiKey) {
      mode = 'local'
      selectedModel = getDefaultModel('local')
    }
    void applyProvider(mode, selectedModel, apiKey)
  })

  $: providerModels = providers.find((provider) => provider.id === mode)?.models ?? []
  $: if (providerModels.length && !providerModels.includes(selectedModel)) {
    selectedModel = providerModels[0]
  }
</script>

<DropDown
  {open}
  {onToggle}
  pickerClass="model-picker"
  buttonClass="nav-icon"
  menuClass="save-dropdown model-dropdown"
  menuAlign="left"
  triggerAriaLabel="Model options"
  menuAriaLabel="Model options"
  title="Model"
  bind:rootEl
>
  <span slot="trigger"><Bot size={16} /></span>

  <div class="field">
    <label for="providerSelect">Provider</label>
    <select
      id="providerSelect"
      bind:value={mode}
      onchange={() => {
        selectedModel = getDefaultModel(mode)
        error = ''
      }}
    >
      {#each providers as provider}
        <option value={provider.id}>{provider.id}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="modelSelect">Model</label>
    <select id="modelSelect" bind:value={selectedModel}>
      {#each providerModels as model}
        <option value={model}>{model}</option>
      {/each}
    </select>
  </div>

  {#if requiresApiKey(mode)}
    <div class="field">
      <label for="apiKeyInput">API key</label>
      <input
        id="apiKeyInput"
        type="password"
        placeholder="Paste Groq API key"
        bind:value={apiKey}
        oninput={() => (error = '')}
      />
    </div>
  {/if}

  {#if error}
    <div class="error">{error}</div>
  {/if}

  <button
    class="save-option-btn apply-btn"
    type="button"
    onclick={async () => {
      const ok = await applyProvider(mode, selectedModel, apiKey)
      if (ok) onToggle()
    }}
  >
    Apply
  </button>
</DropDown>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .field label {
    color: #f5e8dc;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .field select,
  .field input {
    border: 1px solid rgba(243, 223, 208, 0.4);
    background: rgba(78, 43, 25, 0.55);
    color: #fff8f1;
    border-radius: 8px;
    padding: 6px 8px;
    font: inherit;
    min-width: 220px;
  }

  .error {
    color: #ffd7d7;
    font-size: 0.8rem;
    margin-bottom: 8px;
  }

  .apply-btn {
    width: 100%;
    justify-content: center;
  }
</style>
