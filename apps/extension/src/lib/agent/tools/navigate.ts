import { z } from "zod";
import { handleForTab, resolveTabOrThrow, type BrowserTabInfo } from "../driver";
import { invalidateRefs } from "../ref-store";
import { captureSnapshot } from "../snapshot-capture";
import type { BrowserTool } from "../types";

const rawParameters = z
  .object({
    url: z.string().describe("The URL to navigate to"),
    tab: z
      .string()
      .optional()
      .describe(
        "Tab handle (e.g. 't1') to navigate. Omit to use the conversation's target tab (or current active tab).",
      ),
  })
  .strict();

const parameters = z.preprocess((val) => {
  if (typeof val === "string") {
    return { url: val };
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.url !== "string" && typeof obj.href === "string") {
      return { ...obj, url: obj.href };
    }
  }
  return val;
}, rawParameters);

type Input = z.infer<typeof parameters>;

const outputSchema = z.object({
  navigated: z.boolean(),
  url: z.string(),
  tab: z.string().optional(),
  snapshot: z.string().optional(),
  refCount: z.number().optional(),
  note: z.string().optional(),
  error: z.string().optional(),
});
type Output = z.infer<typeof outputSchema>;

export const navigateTool: BrowserTool<Input, Output> = {
  name: "navigate",
  description:
    "Navigate to a URL. Pass `tab` to navigate an existing tab; omit `tab` to use the conversation's target tab (or active tab if none set). The response automatically includes a snapshot of the landed page so you can interact immediately.",
  parameters,
  outputSchema,
  execute: async ({ url, tab: handle }, ctx) => {
    let tabId: ReturnType<typeof ctx.driver.getActiveTabId> = null;
    let createdNew = false;

    if (handle) {
      // Navigate the named tab. We deliberately allow the agent to navigate
      // a tab it didn't open ("user-shared tab"); the only restriction is
      // that the handle must resolve.
      const target = await resolveTabOrThrow(ctx, handle);
      try {
        await ctx.driver.updateTabUrl(target.id, url);
        tabId = target.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          navigated: false,
          url,
          tab: handle,
          error: message,
          note: `Failed to navigate ${handle}: ${message}. The tab may have been closed.`,
        };
      }
    } else {
      // No handle → try to reuse the active/sticky tab first. This implements
      // the priority-based tab affinity: reuse if possible, navigate in place.
      let target: BrowserTabInfo | null = null;
      try {
        target = await resolveTabOrThrow(ctx, undefined);
      } catch {
        target = null;
      }

      if (target && target.id) {
        try {
          await ctx.driver.updateTabUrl(target.id, url);
          tabId = target.id;
        } catch {
          // fall through to create new tab if update failed
        }
      }

      if (!tabId) {
        // No usable tab to reuse → create a new background tab. This is the bootstrap
        // path used on the first action of a conversation. The new tab
        // should land in the conversation's own window — where the chat
        // and the agent's existing tabs live — not whatever window Chrome
        // happens to have focused.
        let targetWindowId: number | undefined = ctx.session?.targetWindowId;
        if (targetWindowId === undefined) {
          try {
            targetWindowId = await Promise.resolve(
              ctx.session?.resolveNewTabWindowId?.(),
            ).catch(() => undefined);
          } catch {
            targetWindowId = undefined;
          }
        }
        if (targetWindowId === undefined && ctx.session?.conversationId) {
          try {
            const modulePath: string = "../conversation-window";
            const mod = (await import(modulePath)) as {
              resolveConversationWindowId: (
                cid: string,
              ) => Promise<number | undefined>;
            };
            targetWindowId = await mod.resolveConversationWindowId(
              ctx.session.conversationId,
            );
          } catch {
            // best-effort
          }
        }
        tabId = await ctx.driver.createTab(url, {
          active: false,
          ...(targetWindowId !== undefined && { windowId: targetWindowId }),
        });
        createdNew = true;
      }
    }

    if (createdNew) {
      await ctx.session?.bindTabsToConversation?.([tabId]);
    }

    await ctx.driver.setActiveTab(tabId);
    // Navigation is a genuine page change — unlike click/type/scroll, the old
    // page's elements are gone, so we DO want a clean slate. Invalidating here
    // also clears the ref-store carry-over pool so stale cross-page refs can't
    // leak into the post-navigation snapshot's merge.
    invalidateRefs(tabId);
    await ctx.driver.waitForLoad(tabId);

    const resolvedHandle = handleForTab(ctx, tabId);

    // Auto-attach initial snapshot so the agent can act on the new page
    // without a follow-up snapshot call.
    try {
      const cap = await captureSnapshot(ctx.driver, tabId);
      return {
        navigated: true,
        url,
        tab: resolvedHandle,
        snapshot: cap.snapshotText,
        refCount: cap.refs.size,
        // Surface cross-extension frame exclusion (e.g. password-manager
        // iframes) so the agent knows the snapshot isn't whole-tree.
        ...(cap.note ? { note: cap.note } : {}),
      };
    } catch (err) {
      return {
        navigated: true,
        url,
        tab: resolvedHandle,
        note: `Navigation succeeded but initial snapshot failed: ${
          err instanceof Error ? err.message : String(err)
        }. Call snapshot to retry.`,
      };
    }
  },
};
