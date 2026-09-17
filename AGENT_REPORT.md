# OpenBrowse Qwen3 Agent Patch

- Branche : `qwen3-webllm-agent`.
- Qwen3 4B/1.7B q4f16/q4f32 restent autorises comme modeles `tools`.
- Fichiers modifies :
	`apps/extension/src/registry/providers/web-llm.ts`.
	`apps/extension/src/lib/agent/agent-transport.ts`.
	`apps/extension/test-qwen3-toolcall.mjs`.
	`AGENT_REPORT.md`.
- Pour Qwen3 WebLLM local, thinking desactive explicitement via
	`providerOptions.web-llm.extra_body.enable_thinking: false`.
- Limite de sortie Qwen3 light agent : `2048` tokens.
- Outils light agent : `readPage`, `snapshot`, `clickElement`,
	`typeInElement`, `navigate`, `listTabs`, `selectTab`, `scrollPage`.
- Le light agent ne s'applique qu'a Qwen3 4B/1.7B WebLLM.
- Compilation TypeScript : reussie (`pnpm compile`).
- Build Chrome : reussie (`pnpm build`).
- Build : `apps/extension/.output/chrome-mv3`.
- Validation WebGPU manuelle restante dans Chrome avec profil separe.
- Aucun push effectue.
