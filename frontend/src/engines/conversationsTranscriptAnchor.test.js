import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  accumulateNewMessageCount,
  CONVERSATIONS_POLL_MS,
  countInboundConversationItems,
  formatNewMessageIndicatorLabel,
  isTranscriptNearBottom,
  nextNewMessageIndicatorCount,
  shouldForceScrollToLatest
} from "./conversationsTranscriptAnchor.js";
import {
  resolveConversationUnreadPresentation,
  unreadIsNeedsAttention
} from "./conversationsCenterPresentation.js";
import {
  clampComposerTextareaHeight,
  resolveComposerTextareaRows,
  STICKY_COMPOSER_MAX_HEIGHT_PX,
  STICKY_COMPOSER_MIN_HEIGHT_PX
} from "./humanWhatsAppComposer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("unread presentation is independent of NEEDS_ATTENTION", () => {
  assert.equal(unreadIsNeedsAttention(), false);
  const one = resolveConversationUnreadPresentation({ unread: true, unreadCount: 1 });
  assert.equal(one.showDot, true);
  assert.equal(one.displayCount, 1);
  assert.equal(one.boldName, true);
  const two = resolveConversationUnreadPresentation({ unreadCount: 2 });
  assert.equal(two.showCount, true);
  assert.equal(two.displayCount, 2);
  const none = resolveConversationUnreadPresentation({ unread: false, unreadCount: 0 });
  assert.equal(none.unread, false);
  assert.equal(none.showDot, false);
});

test("12–14. open thread forces latest; composer stays compact and below transcript", () => {
  assert.equal(shouldForceScrollToLatest({ opening: true, nearBottom: false }), true);
  assert.equal(resolveComposerTextareaRows("sticky"), 2);
  assert.equal(resolveComposerTextareaRows("inline"), 3);
  assert.equal(clampComposerTextareaHeight(20), STICKY_COMPOSER_MIN_HEIGHT_PX);
  assert.equal(clampComposerTextareaHeight(200), STICKY_COMPOSER_MAX_HEIGHT_PX);
  assert.equal(clampComposerTextareaHeight(80), 80);

  const pageJsx = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.jsx"),
    "utf8"
  );
  const pageCss = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.css"),
    "utf8"
  );
  const transcriptIdx = pageJsx.indexOf('data-testid="conversations-thread-transcript"');
  const composerIdx = pageJsx.indexOf('data-testid="conversations-composer-sticky"');
  assert.ok(transcriptIdx > 0 && composerIdx > transcriptIdx);
  assert.match(pageCss, /\.conversations-thread__composer-sticky\s*\{[^}]*position:\s*sticky/s);
  assert.match(pageCss, /\.conversations-thread__composer-sticky\s*\{[^}]*bottom:\s*0/s);
  assert.match(pageCss, /\.conversations-thread__transcript\s*\{[^}]*overflow:\s*auto/s);
  assert.match(pageJsx, /scrollTranscriptToLatest/);
  assert.match(pageJsx, /variant="sticky"/);

  const composerCss = fs.readFileSync(
    path.join(__dirname, "../components/communication/HumanWhatsAppComposer.css"),
    "utf8"
  );
  assert.match(composerCss, /human-whatsapp-composer__input--compact/);
  assert.match(composerCss, /min-height:\s*44px/);
  assert.match(composerCss, /max-height:\s*128px/);
});

test("15–18. live inbound: stay anchored near bottom; indicator when scrolled up", () => {
  assert.equal(
    isTranscriptNearBottom({ scrollHeight: 1000, scrollTop: 920, clientHeight: 80 }),
    true
  );
  assert.equal(
    isTranscriptNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 80 }),
    false
  );
  assert.equal(
    shouldForceScrollToLatest({ opening: false, nearBottom: true }),
    true
  );
  assert.equal(
    shouldForceScrollToLatest({ opening: false, nearBottom: false }),
    false
  );
  assert.equal(
    nextNewMessageIndicatorCount({
      previousInboundCount: 2,
      nextInboundCount: 3,
      nearBottom: true,
      opening: false
    }),
    0
  );
  assert.equal(
    nextNewMessageIndicatorCount({
      previousInboundCount: 2,
      nextInboundCount: 4,
      nearBottom: false,
      opening: false
    }),
    2
  );
  assert.equal(accumulateNewMessageCount(1, 2), 3);
  assert.equal(formatNewMessageIndicatorLabel(1), "New message ↓");
  assert.equal(formatNewMessageIndicatorLabel(3), "3 new messages ↓");
  assert.equal(
    countInboundConversationItems([
      { direction: "inbound" },
      { direction: "outbound" },
      { direction: "incoming" }
    ]),
    2
  );

  const pageJsx = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.jsx"),
    "utf8"
  );
  assert.match(pageJsx, /conversations-new-message/);
  assert.match(pageJsx, /onJumpToLatest/);
  assert.match(pageJsx, /CONVERSATIONS_POLL_MS/);
  assert.equal(CONVERSATIONS_POLL_MS, 12000);
  assert.match(pageJsx, /markConversationRead/);
  assert.doesNotMatch(pageJsx, /acknowledgeLead/);
});
