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
      contextWindow: 4096,
      maxOutputTokens: 512,
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
    let reqCounter = 0;
    const customFetch: typeof fetch = async (input, init) => {
      if (init && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);
          if (body && typeof body === "object") {
            reqCounter++;
            const reqNum = reqCounter;
            const startTime = Date.now();
            const startIso = new Date(startTime).toISOString();
            const msgCount = Array.isArray(body.messages) ? body.messages.length : 0;
            const tools = Array.isArray(body.tools) ? body.tools : [];
            const toolNames = tools.map((t: any) => t.function?.name || t.type).join(", ");
            const charLength = init.body.length;
            const estTokens = Math.ceil(charLength / 4);

            const sysMsg = body.messages?.find((m: any) => m.role === "system");
            const sysChars = sysMsg?.content?.length ?? 0;
            const histChars = charLength - sysChars;

            console.log(`[OLLAMA REQUEST #${reqNum}] purpose=chat/generation | time=${startIso} | totalBodyChars=${charLength} (~${estTokens} est. tokens) | sysChars=${sysChars} | histChars=${histChars} | toolsCount=${tools.length} [${toolNames}]`);

            body.think = false;
            body.options = { ...(body.options || {}), think: false, keep_alive: "30m" };
            init = { ...init, body: JSON.stringify(body) };

            const res = await fetch(input, init);
            const duration = Date.now() - startTime;
            console.log(`[OLLAMA RESPONSE #${reqNum}] elapsedMs=${duration}ms status=${res.status}`);
            return res;
          }
        } catch (e) {
          console.error("[Ollama Diagnostic Error]", e);
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
