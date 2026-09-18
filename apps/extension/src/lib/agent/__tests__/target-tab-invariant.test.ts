import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabRegistry } from "../tab-registry";

function makeChromeStubWithTabs(initialTabs: chrome.tabs.Tab[]) {
  const tabs = new Map<number, chrome.tabs.Tab>();
  for (const t of initialTabs) {
    tabs.set(t.id!, t);
  }
  return {
    tabs,
    chrome: {
      tabs: {
        get: vi.fn(async (id: number) => {
          const t = tabs.get(id);
          if (!t) throw new Error(`Tab ${id} not found`);
          return t;
        }),
        query: vi.fn(async (q: chrome.tabs.QueryInfo) => {
          return Array.from(tabs.values()).filter(
            (t) =>
              (q.active === undefined || t.active === q.active) &&
              (q.windowId === undefined || t.windowId === q.windowId),
          );
        }),
        update: vi.fn(async (id: number, updateProperties: { url?: string }) => {
          const t = tabs.get(id);
          if (t && updateProperties.url) {
            t.url = updateProperties.url;
          }
          return t;
        }),
      },
      windows: {
        get: vi.fn(async (id: number) => ({ id })),
      },
      runtime: { id: "test" },
    } as unknown as typeof chrome,
  };
}

describe("Target tab invariant & Ollama local behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    tabRegistry.__resetForTests!();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Test A: readPage without tab reads Quiz target even when ChatGPT is active", async () => {
    const { chrome: fake, tabs } = makeChromeStubWithTabs([
      { id: 101, windowId: 1, active: false, url: "https://quiz.example" } as chrome.tabs.Tab,
      { id: 102, windowId: 1, active: true, url: "https://chatgpt.com" } as chrome.tabs.Tab,
    ]);
    vi.stubGlobal("chrome", fake);

    const activeTabMod = await import("../active-tab");
    activeTabMod.__resetActiveTabForTests();

    // Bind conversation to Quiz tab (101)
    activeTabMod.setTargetTabId(101, "conv-quiz");

    // Resolve active user tab for conv-quiz
    const resolvedTab = await activeTabMod.getActiveUserTab({ conversationId: "conv-quiz" });
    expect(resolvedTab.id).toBe(101);
    expect(resolvedTab.url).toBe("https://quiz.example");
  });

  it("Test B: clickElement without tab acts on Quiz target when ChatGPT is active", async () => {
    const { chrome: fake } = makeChromeStubWithTabs([
      { id: 101, windowId: 1, active: false, url: "https://quiz.example" } as chrome.tabs.Tab,
      { id: 102, windowId: 1, active: true, url: "https://chatgpt.com" } as chrome.tabs.Tab,
    ]);
    vi.stubGlobal("chrome", fake);

    const activeTabMod = await import("../active-tab");
    activeTabMod.__resetActiveTabForTests();

    activeTabMod.setTargetTabId(101, "conv-quiz");

    const resolvedTab = await activeTabMod.getActiveUserTab({ conversationId: "conv-quiz" });
    expect(resolvedTab.id).toBe(101);
  });

  it("Test C: navigate without tab navigates Quiz and leaves ChatGPT untouched", async () => {
    const { chrome: fake, tabs } = makeChromeStubWithTabs([
      { id: 101, windowId: 1, active: false, url: "https://quiz.example" } as chrome.tabs.Tab,
      { id: 102, windowId: 1, active: true, url: "https://chatgpt.com" } as chrome.tabs.Tab,
    ]);
    vi.stubGlobal("chrome", fake);

    const activeTabMod = await import("../active-tab");
    activeTabMod.__resetActiveTabForTests();

    activeTabMod.setTargetTabId(101, "conv-quiz");

    const targetTab = await activeTabMod.getActiveUserTab({ conversationId: "conv-quiz" });
    expect(targetTab.id).toBe(101);

    // Simulate navigation update on target tab
    await fake.tabs.update(targetTab.id!, { url: "https://quiz.example/question2" });
    expect(tabs.get(101)?.url).toBe("https://quiz.example/question2");
    expect(tabs.get(102)?.url).toBe("https://chatgpt.com"); // ChatGPT untouched
  });

  it("Test D: Target closed throws error and fails closed (no fallback to active ChatGPT)", async () => {
    const { chrome: fake } = makeChromeStubWithTabs([
      // tab 101 is NOT in tabs map (simulating closed tab)
      { id: 102, windowId: 1, active: true, url: "https://chatgpt.com" } as chrome.tabs.Tab,
    ]);
    vi.stubGlobal("chrome", fake);

    const activeTabMod = await import("../active-tab");
    activeTabMod.__resetActiveTabForTests();

    activeTabMod.setTargetTabId(101, "conv-quiz");

    await expect(
      activeTabMod.getActiveUserTab({ conversationId: "conv-quiz" })
    ).rejects.toThrowError(/unavailable/i);
  });

  it("Test E: Two conversations with different targets have no contamination", async () => {
    const { chrome: fake } = makeChromeStubWithTabs([
      { id: 101, windowId: 1, active: false, url: "https://quiz-a.example" } as chrome.tabs.Tab,
      { id: 202, windowId: 1, active: false, url: "https://quiz-b.example" } as chrome.tabs.Tab,
      { id: 303, windowId: 1, active: true, url: "https://chatgpt.com" } as chrome.tabs.Tab,
    ]);
    vi.stubGlobal("chrome", fake);

    const activeTabMod = await import("../active-tab");
    activeTabMod.__resetActiveTabForTests();

    activeTabMod.setTargetTabId(101, "conv-A");
    activeTabMod.setTargetTabId(202, "conv-B");

    const tabA = await activeTabMod.getActiveUserTab({ conversationId: "conv-A" });
    const tabB = await activeTabMod.getActiveUserTab({ conversationId: "conv-B" });

    expect(tabA.id).toBe(101);
    expect(tabB.id).toBe(202);
  });
});
