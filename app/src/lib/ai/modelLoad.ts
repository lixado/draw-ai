export type TextGenerator = (
  prompt: string,
  options?: { max_new_tokens?: number; temperature?: number }
) => Promise<Array<{ generated_text?: string }>>

const MODEL_NAME = 'Xenova/distilgpt2'

let generatorPromise: Promise<TextGenerator | null> | null = null
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

export const getSuggestionTextGenerator = async (): Promise<TextGenerator | null> => {
  if (generatorPromise) return generatorPromise
  generatorPromise = import('@huggingface/transformers')
    .then(async ({ env, pipeline }) => {
      const runtimeEnv = (env ?? {}) as {
        useBrowserCache?: boolean
        allowLocalModels?: boolean
        allowRemoteModels?: boolean
        remoteHost?: string
        remotePathTemplate?: string
        fetch?: typeof fetch
      }
      const configureEnv = (useBrowserCache: boolean) => {
        if ('allowLocalModels' in runtimeEnv) runtimeEnv.allowLocalModels = false
        if ('allowRemoteModels' in runtimeEnv) runtimeEnv.allowRemoteModels = true
        if ('useBrowserCache' in runtimeEnv) runtimeEnv.useBrowserCache = useBrowserCache
        if ('remoteHost' in runtimeEnv) runtimeEnv.remoteHost = 'https://huggingface.co/'
        if ('remotePathTemplate' in runtimeEnv) runtimeEnv.remotePathTemplate = '{model}/resolve/{revision}/'
      }

      installWarningFilter()
      installHfFetchPatch(runtimeEnv)
      console.log(`[drawAi:model] loading ${MODEL_NAME}`)

      const buildWebGpuGenerator = async (useBrowserCache: boolean) => {
        configureEnv(useBrowserCache)
        const next = await pipeline('text-generation', MODEL_NAME, { device: 'webgpu' })
        console.log(`[drawAi:model] loaded ${MODEL_NAME} (webgpu)`)
        return next as TextGenerator
      }
      let activeGenerator: TextGenerator
      try {
        activeGenerator = await buildWebGpuGenerator(true)
      } catch (firstLoadError) {
        console.warn(
          `[drawAi:model] cached webgpu load failed, retrying uncached (${summarizeError(firstLoadError)})`
        )
        activeGenerator = await buildWebGpuGenerator(false)
      }

      // Serialize runs: overlapping WebGPU OrtRun calls can corrupt buffers.
      let runQueue: Promise<void> = Promise.resolve()
      const guardedGenerator: TextGenerator = async (prompt, options) => {
        let release!: () => void
        const waitTurn = runQueue
        runQueue = new Promise<void>((resolve) => {
          release = resolve
        })
        await waitTurn
        try {
          return await activeGenerator(prompt, options)
        } catch (runtimeError) {
          if (!isRecoverableWebGpuError(runtimeError)) {
            console.error(`[drawAi:model] webgpu runtime failed: ${summarizeError(runtimeError)}`)
            throw runtimeError
          }
          console.warn(`[drawAi:model] webgpu buffer failure, rebuilding pipeline`)
          activeGenerator = await buildWebGpuGenerator(false)
          return activeGenerator(prompt, options)
        } finally {
          release()
        }
      }
      return guardedGenerator
    })
    .catch((error) => {
      console.error(`[drawAi:model] webgpu load/execute failed ${MODEL_NAME}: ${summarizeError(error)}`)
      return null
    })
  return generatorPromise
}

export const prewarmSuggestionTextGenerator = async (): Promise<void> => {
  await getSuggestionTextGenerator()
}

export const resetSuggestionGeneratorForDebug = () => {
  generatorPromise = null
}
