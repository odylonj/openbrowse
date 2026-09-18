import { describe, expect, it } from "vitest";
import { LOCAL_OLLAMA_TOOLS } from "../agent-transport";
import { LOCAL_LITE_SYSTEM_PROMPT } from "../system-prompt";

describe("Ollama Local Toolset and System Prompt", () => {
  it("does not expose listTabs or selectTab", () => {
    expect(LOCAL_OLLAMA_TOOLS.has("listTabs")).toBe(false);
    expect(LOCAL_OLLAMA_TOOLS.has("selectTab")).toBe(false);
  });

  it("always exposes snapshot, clickElement, readPage, navigate, typeInElement, scrollPage", () => {
    expect(LOCAL_OLLAMA_TOOLS.has("snapshot")).toBe(true);
    expect(LOCAL_OLLAMA_TOOLS.has("clickElement")).toBe(true);
    expect(LOCAL_OLLAMA_TOOLS.has("readPage")).toBe(true);
    expect(LOCAL_OLLAMA_TOOLS.has("navigate")).toBe(true);
    expect(LOCAL_OLLAMA_TOOLS.has("typeInElement")).toBe(true);
    expect(LOCAL_OLLAMA_TOOLS.has("scrollPage")).toBe(true);
  });

  it("includes rules against guessing @e refs or searching tabs in LOCAL_LITE_SYSTEM_PROMPT", () => {
    expect(LOCAL_LITE_SYSTEM_PROMPT).toContain("Never search for, select, or switch tabs");
    expect(LOCAL_LITE_SYSTEM_PROMPT).toContain("Never guess or invent @e refs");
  });
});
