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
      id: "qwen2.5:3b",
      name: "Qwen2.5 3B (Ollama)",
      capabilities: ["chat", "tools"],
      contextWindow: 8192,
      maxOutputTokens: 2048,
    },
    {
      id: "qwen3:4b",
      name: "Qwen3 4B (Ollama)",
      capabilities: ["chat", "tools", "thinking"],
      contextWindow: 16384,
      maxOutputTokens: 4096,
    },
  ],
  async createLanguageModel(config, modelId) {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const customFetch: typeof fetch = async (input, init) => {
      if (init && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);
          if (body && typeof body === "object") {
            const msgCount = Array.isArray(body.messages) ? body.messages.length : 0;
            const toolsCount = Array.isArray(body.tools) ? body.tools.length : 0;
            const toolNames = Array.isArray(body.tools) ? body.tools.map((t: any) => t.function?.name || t.type).join(", ") : "none";
            const charLength = init.body.length;
            const estTokens = Math.ceil(charLength / 4);
            console.log(`[Ollama Local Diagnostic] Messages: ${msgCount} | Chars: ${charLength} (~${estTokens} tokens) | Tools: ${toolsCount} [${toolNames}]`);

            body.think = false;
            body.options = { ...(body.options || {}), think: false };
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch {
          // Ignore non-JSON bodies
        }
      }
      return fetch(input, init);
    };
    const provider = createOpenAICompatible({
      name: "ollama",
      baseURL: config.baseUrl || "http://127.0.0.1:11434/v1",
      apiKey: config.apiKey || "ollama",
      fetch: customFetch,
    });
    return provider(modelId);
  },
};
