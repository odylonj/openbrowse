import type { ProviderDefinition } from "./types";

export const definition: ProviderDefinition = {
  id: "ollama-local",
  name: "Ollama Local",
  icon: { light: "ollama.svg", dark: "ollama-dark.svg" },
  description: "Run open-source models locally using Ollama",
  setup: "byok",
  configSchema: [
    {
      key: "baseUrl",
      label: "Base URL",
      type: "text",
      required: true,
      default: "http://127.0.0.1:11434/v1",
      placeholder: "http://127.0.0.1:11434/v1",
      description: "The Ollama API base URL (must end in /v1)",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: false,
      default: "ollama",
      placeholder: "ollama",
      description: "Dummy API key for local Ollama instance",
    },
  ],
  models: [
    {
      id: "qwen3:4b",
      name: "Qwen3 4B (Ollama)",
      capabilities: ["chat", "tools", "thinking"],
      contextWindow: 4096,
    },
  ],
  async createLanguageModel(config, modelId) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const provider = createOpenAI({
      baseURL: config.baseUrl || "http://127.0.0.1:11434/v1",
      apiKey: config.apiKey || "ollama",
    });
    return provider(modelId);
  },
};
