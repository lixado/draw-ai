export interface ProviderInterface {
  /**
   * Initializes the provider (remote or local model).
   * Pass API key when required, otherwise null.
   */
  modelInit(apiKey: string | null): Promise<void> | void;

  /**
   * Generates output from a system prompt (instructions / role) and a user prompt (task + data).
   * Chat APIs use `systemPrompt` as the system message; local text models prepend it to the user text.
   * Optional `maxNewTokens` caps generation length (local models); remote may ignore it.
   */
  generate(
    systemPrompt: string,
    prompt: string,
    options?: { maxNewTokens?: number }
  ): Promise<string> | string;

  /**
   * Cleans up provider resources when done or switching models.
   */
  destroy(): Promise<void> | void;
}