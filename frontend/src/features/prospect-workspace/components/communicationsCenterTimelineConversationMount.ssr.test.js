/**
 * Production regression: Conversations detail must not crash with
 * `isConversationBubbleItem is not defined` after transcript load.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../../../");
const timelineSrcPath = path.join(__dirname, "CommunicationsCenterTimeline.jsx");

const BUBBLE_ITEMS = [
  {
    id: "in-1",
    category: "message",
    channel: "whatsapp",
    direction: "inbound",
    content: { text: "Hola, quiero info" },
    timestampUtc: "2026-08-13T16:00:00.000Z"
  },
  {
    id: "out-1",
    category: "message",
    channel: "whatsapp",
    direction: "outbound",
    content: { text: "Claro, te ayudo" },
    timestampUtc: "2026-08-13T16:01:00.000Z"
  },
  {
    id: "sys-1",
    category: "message",
    channel: "whatsapp",
    direction: "inbound",
    content: { text: "[Required Information Updated]" },
    ai: { intent: "REQUIRED_INFORMATION_UPDATED" },
    timestampUtc: "2026-08-13T16:02:00.000Z"
  },
  {
    id: "note-1",
    category: "message",
    channel: "note",
    direction: "inbound",
    flags: ["agent_note"],
    content: { text: "[Agent note] internal" },
    timestampUtc: "2026-08-13T16:03:00.000Z"
  }
];

test("Conversations detail transcript executes bubble filter without ReferenceError", async () => {
  const src = fs.readFileSync(timelineSrcPath, "utf8");
  assert.match(
    src,
    /import \{[\s\S]*selectConversationLayoutBubbles[\s\S]*\} from ["']\.\.\/\.\.\/\.\.\/engines\/communicationsCenterViewModel["']/
  );
  assert.doesNotMatch(src, /isConversationBubbleItem\s*\(/);

  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error"
  });

  try {
    const timelineModule = await server.ssrLoadModule(
      "/src/features/prospect-workspace/components/CommunicationsCenterTimeline.jsx"
    );
    const languageModule = await server.ssrLoadModule("/src/i18n/LanguageContext.jsx");
    const pageModule = await server.ssrLoadModule("/src/pages/ConversationsPage.jsx");
    const viewModel = await server.ssrLoadModule(
      "/src/engines/communicationsCenterViewModel.js"
    );

    const CommunicationsCenterTimeline = timelineModule.default;
    const ConversationsPage = pageModule.default;
    const { LanguageProvider } = languageModule;
    const { isConversationBubbleItem, selectConversationLayoutBubbles } = viewModel;

    assert.equal(typeof isConversationBubbleItem, "function");
    assert.equal(typeof selectConversationLayoutBubbles, "function");

    assert.equal(isConversationBubbleItem(BUBBLE_ITEMS[0]), true);
    assert.equal(isConversationBubbleItem(BUBBLE_ITEMS[1]), true);
    assert.equal(isConversationBubbleItem(BUBBLE_ITEMS[2]), false);
    assert.equal(isConversationBubbleItem(BUBBLE_ITEMS[3]), false);

    let bubbles;
    try {
      bubbles = selectConversationLayoutBubbles(BUBBLE_ITEMS);
    } catch (error) {
      assert.fail(
        `conversation detail bubble filter threw: ${error && error.message}`
      );
    }
    assert.deepEqual(
      bubbles.map((item) => item.id),
      ["in-1", "out-1"]
    );

    const timelineHtml = renderToString(
      React.createElement(CommunicationsCenterTimeline, {
        prospectId: "prospect-conversations-detail",
        layout: "conversation",
        refreshSignal: 0
      })
    );
    assert.doesNotMatch(timelineHtml, /isConversationBubbleItem is not defined/);
    assert.match(timelineHtml, /cc-timeline--conversation|Conversation/);

    const pageHtml = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/app/conversations"] },
        React.createElement(LanguageProvider, null, React.createElement(ConversationsPage))
      )
    );
    assert.doesNotMatch(pageHtml, /isConversationBubbleItem is not defined/);
    assert.match(pageHtml, /conversations-page/);
    assert.doesNotMatch(pageHtml, /acknowledgeLead/);
  } finally {
    await server.close();
  }
});
