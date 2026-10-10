export type RenderInput = {
  prompt: string;
  /** Decrypted reference captures (JPEG). The renderer must not keep them. */
  references: Uint8Array[];
  licenceId: bigint;
  renderIndex: number;
};

export type RenderOutput = {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  provider: "gemini" | "dev";
  model: string;
  /** True only for the DevRenderer: not a model output, watermarked TEST RENDER. */
  test: boolean;
  /** Provider-reported usage (Gemini usageMetadata), for cost accounting. */
  usage?: Record<string, unknown>;
};
