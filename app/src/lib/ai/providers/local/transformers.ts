import type { ProviderInterface } from '../provider_interface'

type TextGenerator = (
  prompt: string,
  options?: { max_new_tokens?: number; temperature?: number }
) => Promise<Array<{ generated_text?: string }>>

const DEFAULT_MODEL_NAME = 'Xenova/distilgpt2'

let warningFilterInstalled = false
let hfFetchPatched = false

const summarizeError = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

const isRecoverableWebGpuError = (error: unknown): boolean => {
  const message = summarizeError(error)
  return (
    message.includes('failed to call OrtRun') ||
    message.includes('Invalid buffer') ||
    message.includes('MapAsyncStatus') ||
    message.includes('Mapping WebGPU buffer failed')
  )
}

const installWarningFilter = () => {
  if (warningFilterInstalled || typeof window === 'undefined') return
  warningFilterInstalled = true
  const originalWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const text = args.map((x) => (typeof x === 'string' ? x : '')).join(' ')
    if (text.includes('CleanUnusedInitializersAndNodeArgs') || text.includes('[W:onnxruntime')) return
    originalWarn(...args)
  }
}

const installHfFetchPatch = (runtimeEnv: { fetch?: typeof fetch }) => {
  if (hfFetchPatched || typeof window === 'undefined' || typeof fetch === 'undefined') return
  const baseFetch = (runtimeEnv.fetch ?? fetch).bind(globalThis)
  runtimeEnv.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    let requestUrl = rawUrl

    if (requestUrl.includes('huggingface.co/') && requestUrl.includes('/resolve/')) {
      const separator = requestUrl.includes('?') ? '&' : '?'
      requestUrl = `${requestUrl}${separator}download=1`
    }

    const response = await baseFetch(requestUrl, {
      cache: 'no-store',
      ...init
    })
    if (!response.ok) {
      throw new Error(`[drawAi:model] HTTP ${response.status} while loading ${requestUrl}`)
    }
    return response
  }
  hfFetchPatched = true
}

export class TransformersProvider implements ProviderInterface {
  private activeGenerator: TextGenerator | null = null
  private runQueue: Promise<void> = Promise.resolve()
  private destroyed = false

  constructor(private readonly modelName: string = DEFAULT_MODEL_NAME) {}

  async modelInit(_apiKey: string | null): Promise<void> {
    this.destroyed = false
    this.activeGenerator = await this.loadGenerator(true)
    if (!this.activeGenerator) {
      this.activeGenerator = await this.loadGenerator(false)
    }
    if (!this.activeGenerator) {
      throw new Error(`[drawAi:model] failed to initialize ${this.modelName}`)
    }
  }

  async generate(prompt: string): Promise<string> {
    if (this.destroyed) return ''
    if (!this.activeGenerator) {
      await this.modelInit(null)
    }
    if (!this.activeGenerator) return ''

    let release!: () => void
    const waitTurn = this.runQueue
    this.runQueue = new Promise<void>((resolve) => {
      release = resolve
    })

    await waitTurn
    try {
      const out = await this.activeGenerator(prompt, { max_new_tokens: 32, temperature: 0.25 })
      return out?.[0]?.generated_text ?? ''
    } catch (runtimeError) {
      if (!isRecoverableWebGpuError(runtimeError)) {
        console.error(`[drawAi:model] webgpu runtime failed: ${summarizeError(runtimeError)}`)
        return ''
      }
      console.warn(`[drawAi:model] webgpu buffer failure, rebuilding pipeline`)
      this.activeGenerator = await this.loadGenerator(false)
      if (!this.activeGenerator) return ''
      const out = await this.activeGenerator(prompt, { max_new_tokens: 32, temperature: 0.25 })
      return out?.[0]?.generated_text ?? ''
    } finally {
      release()
    }
  }

  destroy(): void {
    this.destroyed = true
    this.activeGenerator = null
    this.runQueue = Promise.resolve()
  }

  private async loadGenerator(useBrowserCache: boolean): Promise<TextGenerator | null> {
    try {
      const { env, pipeline } = await import('@huggingface/transformers')
      const runtimeEnv = (env ?? {}) as {
        useBrowserCache?: boolean
        allowLocalModels?: boolean
        allowRemoteModels?: boolean
        remoteHost?: string
        remotePathTemplate?: string
        fetch?: typeof fetch
      }

      if ('allowLocalModels' in runtimeEnv) runtimeEnv.allowLocalModels = false
      if ('allowRemoteModels' in runtimeEnv) runtimeEnv.allowRemoteModels = true
      if ('useBrowserCache' in runtimeEnv) runtimeEnv.useBrowserCache = useBrowserCache
      if ('remoteHost' in runtimeEnv) runtimeEnv.remoteHost = 'https://huggingface.co/'
      if ('remotePathTemplate' in runtimeEnv) runtimeEnv.remotePathTemplate = '{model}/resolve/{revision}/'

      installWarningFilter()
      installHfFetchPatch(runtimeEnv)
      console.log(`[drawAi:model] loading ${this.modelName}`)
      const next = await pipeline('text-generation', this.modelName, { device: 'webgpu' })
      console.log(`[drawAi:model] loaded ${this.modelName} (webgpu)`)
      return next as TextGenerator
    } catch (error) {
      console.error(
        `[drawAi:model] webgpu load/execute failed ${this.modelName}: ${summarizeError(error)}`
      )
      return null
    }
  }
}