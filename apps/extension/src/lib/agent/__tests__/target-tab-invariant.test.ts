import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabRegistry } from "../tab-registry";
import type { BrowserDriver, ToolContext } from "../driver";

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

function makeMockDriver(tabs: Map<number, chrome.tabs.Tab>, conversationId = "conv-quiz"): BrowserDriver {
  return {
    getActiveTab: async () => {
      const activeTabMod = await import("../active-tab");
      const tab = await activeTabMod.getActiveUserTab({ conversationId });
      return { id: tab.id!, url: tab.url!, title: tab.title ?? "", active: tab.active };
    },
    updateTabUrl: async (tabId: number, url: string) => {
      const t = tabs.get(tabId);
      if (t) t.url = url;
    },
    setActiveTab: vi.fn(),
    waitForLoad: async () => undefined,
    createTab: vi.fn(async (url: string) => {
      const id = Math.max(...Array.from(tabs.keys()), 100) + 1;
      tabs.set(id, { id, url, active: false } as chrome.tabs.Tab);
      return id;
    }),
    getTab: vi.fn(async (tabId: number) => {
      const t = tabs.get(tabId);
      if (!t) throw new Error("Tab not found");
      return { id: t.id!, url: t.url!, title: t.title ?? "", active: t.active, favIconUrl: t.favIconUrl, pinned: t.pinned };
    }),
  } as unknown as BrowserDriver;
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
    expect(resolvedTab.url).toBe("https://quiz.example");
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

    const { navigateTool } = await import("../tools/navigate");

    const driver = makeMockDriver(tabs);
    const ctx: ToolContext = {
      driver,
      session: {
        conversationId: "conv-quiz",
        resolveHandle: (h: string) => (h === "t1" ? 101 : 102),
        bindTabsToConversation: async () => {},
      },
    } as unknown as ToolContext;

    await navigateTool.execute({ url: "https://quiz.example/question2" }, ctx);

    expect(tabs.get(101)?.url).toBe("https://quiz.example/question2");
    expect(tabs.get(102)?.url).toBe("https://chatgpt.com"); // ChatGPT untouched
    expect(driver.setActiveTab).toHaveBeenCalledWith(101);
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

    const { navigateTool } = await import("../tools/navigate");

    const driver = makeMockDriver(new Map());
    const ctx: ToolContext = {
      driver,
      session: { conversationId: "conv-quiz" },
    } as unknown as ToolContext;

    // navigate({url}) without handle should throw when target is closed and fail closed
    await expect(
      navigateTool.execute({ url: "https://quiz.example" }, ctx)
    ).rejects.toThrowError();
  });

  it("Test: Auxiliary tab navigation does NOT repin target tab", async () => {
    const { chrome: fake, tabs } = makeChromeStubWithTabs([
      { id: 101, windowId: 1, active: false, url: "https://quiz.example" } as chrome.tabs.Tab,
      { id: 102, windowId: 1, active: true, url: "https://aux.example" } as chrome.tabs.Tab,
    ]);
    vi.stubGlobal("chrome", fake);

    const activeTabMod = await import("../active-tab");
    activeTabMod.__resetActiveTabForTests();
    activeTabMod.setTargetTabId(101, "conv-quiz");

    const { navigateTool } = await import("../tools/navigate");

    const driver = makeMockDriver(tabs);
    const ctx: ToolContext = {
      driver,
      session: {
        conversationId: "conv-quiz",
        resolveHandle: (h: string) => (h === "t1" ? 101 : 102),
      },
    } as unknown as ToolContext;

    // Navigate auxiliary tab 102 ("tAux")
    await navigateTool.execute({ url: "https://aux.example/new", tab: "tAux" }, ctx);

    expect(tabs.get(102)?.url).toBe("https://aux.example/new");
    // Main target MUST remain 101
    expect(activeTabMod.getTargetTabId("conv-quiz")).toBe(101);
    // setActiveTab should NOT have been called with 102
    expect(driver.setActiveTab).not.toHaveBeenCalledWith(102);
  });
});
