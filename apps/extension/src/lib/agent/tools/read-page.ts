import { z } from "zod";
import type { BrowserTool } from "../types";
import { resolveTabOrThrow, handleForTab } from "../driver";

const parameters = z.object({
  tab: z
    .string()
    .describe(
      "Tab handle to read (e.g. 't1').",
    ),
});

type Input = z.infer<typeof parameters>;

const outputSchema = z.object({
  tab: z.string(),
  url: z.string(),
  title: z.string(),
  h1: z.string(),
  description: z.string(),
  bodyText: z.string(),
  links: z.array(z.object({ text: z.string(), href: z.string() })),
});
type Output = z.infer<typeof outputSchema>;

export const readPageTool: BrowserTool<Input, Output> = {
  name: "readPage",
  description:
    "Read the content of a tab. Pass `tab` (handle from the tab legend or listTabs), or omit to read the active tab. Returns the URL, title, headings, description, body text, and links.",
  parameters,
  outputSchema,
  execute: async ({ tab: handle }, ctx) => {
    const tab = await resolveTabOrThrow(ctx, handle);
    const resolvedHandle = handleForTab(ctx, tab.id);
    const url = tab.url ?? "";

    if (url.startsWith("chrome-extension://") || url.startsWith("chrome://")) {
      return {
        tab: resolvedHandle,
        url,
        title: tab.title ?? "",
        h1: "",
        description: "",
        bodyText: "",
        links: [],
      };
    }

    const result = await ctx.driver.sendToContentScript<Omit<Output, "tab">>(
      tab.id,
      { type: "CHAT_EXTRACT_CONTENT" },
    );
    return { tab: resolvedHandle, ...result };
  },
};
