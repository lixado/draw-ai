export interface ProviderInterface {
  /**
   * Initializes the provider (remote or local model).
   * Pass API key when required, otherwise null.
   */
  modelInit(apiKey: string | null): Promise<void> | void;

  /**
   * Generates output text from a prompt string.
   */
  generate(prompt: string): Promise<string> | string;

  /**
   * Cleans up provider resources when done or switching models.
   */
  destroy(): Promise<void> | void;
}