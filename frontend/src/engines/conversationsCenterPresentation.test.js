/**
 * Conversations Center pilot presentation helpers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationHeaderModel,
  resolveEffectiveOwnership,
  isHumanComposerEnabled,
  canTakeOverConversation,
  canReturnConversationToAtlas,
  resolveThreadActionIds,
  resolveLifecycleActionIds,
  conversationsThreadRegionOrder,
  conversationsThreadHeaderRegionOrder,
  shouldShowAttentionWarning,
  isUserFacingConversationGoal,
  shouldShowHandoffReasonInHeader
} from "./conversationsCenterPresentation.js";
import { orderCommunicationsForDisplay } from "./communicationsCenterViewModel.js";
import { translations } from "../i18n/translations.js";
import {
  MISSION_CONTROL_QUERY_KEYS,
  buildMissionControlQuery
} from "./missionControlRouteEngine.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("header model exposes full copyable phone for authorized detail UI", () => {
  const model = buildConversationHeaderModel({
    name: "Mayra",
    phone: "+13473369274",
    source: "whatsapp",
    ownershipState: "HUMAN",
    appointmentStatus: "none"
  });

  assert.equal(model.phone, "+13473369274");
  assert.equal(model.phoneCopyable, true);
  assert.equal(model.name, "Mayra");
  assert.equal(model.ownershipState, "HUMAN");
});

test("effectiveOwnership collapses NEEDS_ATTENTION to ATLAS for controls", () => {
  assert.equal(resolveEffectiveOwnership("HUMAN"), "HUMAN");
  assert.equal(resolveEffectiveOwnership("ATLAS"), "ATLAS");
  assert.equal(resolveEffectiveOwnership("NEEDS_ATTENTION"), "ATLAS");
  assert.equal(resolveEffectiveOwnership(null), "ATLAS");
});

test("NEEDS_ATTENTION + effectiveOwnership=ATLAS → actions=['TAKE_OVER'] only", () => {
  const ownershipState = "NEEDS_ATTENTION";
  const effectiveOwnership = resolveEffectiveOwnership(ownershipState);
  assert.equal(effectiveOwnership, "ATLAS");
  assert.deepEqual(
    resolveThreadActionIds({ ownershipState, effectiveOwnership }),
    ["TAKE_OVER"]
  );
  assert.equal(
    resolveThreadActionIds({ ownershipState, effectiveOwnership }).includes(
      "RETURN_TO_ATLAS"
    ),
    false
  );
});

test("HUMAN + stall attention warning coexists; RETURN only; composer on", () => {
  const ownershipState = "HUMAN";
  const effective = resolveEffectiveOwnership(ownershipState);
  assert.equal(canTakeOverConversation(effective), false);
  assert.equal(canReturnConversationToAtlas(effective), true);
  assert.equal(isHumanComposerEnabled(effective), true);
  assert.equal(
    shouldShowAttentionWarning({
      ownershipState,
      needsHumanAttention: true
    }),
    true
  );
  assert.deepEqual(
    resolveThreadActionIds({ ownershipState, effectiveOwnership: effective }),
    ["RETURN_TO_ATLAS"]
  );
});

test("ATLAS → TAKE OVER only", () => {
  const effective = resolveEffectiveOwnership("ATLAS");
  assert.equal(canTakeOverConversation(effective), true);
  assert.equal(canReturnConversationToAtlas(effective), false);
  assert.equal(isHumanComposerEnabled(effective), false);
});

test("after TAKE OVER → HUMAN / RETURN only; after RETURN → ATLAS / TAKE OVER only", () => {
  const afterTakeOver = resolveEffectiveOwnership("HUMAN");
  assert.equal(canTakeOverConversation(afterTakeOver), false);
  assert.equal(canReturnConversationToAtlas(afterTakeOver), true);

  const afterReturn = resolveEffectiveOwnership("ATLAS");
  assert.equal(canTakeOverConversation(afterReturn), true);
  assert.equal(canReturnConversationToAtlas(afterReturn), false);

  // Atlas-owned stall (no sticky HUMAN) still offers TAKE OVER.
  assert.deepEqual(
    {
      take: canTakeOverConversation(resolveEffectiveOwnership("NEEDS_ATTENTION")),
      ret: canReturnConversationToAtlas(resolveEffectiveOwnership("NEEDS_ATTENTION"))
    },
    { take: true, ret: false }
  );
});

test("lifecycle actions: Active can archive/close/mark-test; Archived can restore", () => {
  assert.deepEqual(resolveLifecycleActionIds({ inboxLifecycle: "ACTIVE" }), [
    "ARCHIVE",
    "CLOSE",
    "MARK_TEST"
  ]);
  assert.deepEqual(resolveLifecycleActionIds({ inboxLifecycle: "ARCHIVED" }), [
    "RESTORE"
  ]);
  assert.deepEqual(resolveLifecycleActionIds({ inboxLifecycle: "SCHEDULED" }), []);
});

test("sticky thread region places composer after scrollable transcript", () => {
  assert.deepEqual(conversationsThreadRegionOrder(), [
    "sticky_controls",
    "timeline",
    "composer"
  ]);

  const pageJsx = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.jsx"),
    "utf8"
  );
  const stickyIdx = pageJsx.indexOf('data-testid="conversations-composer-sticky"');
  const transcriptIdx = pageJsx.indexOf('data-testid="conversations-thread-transcript"');
  assert.ok(transcriptIdx > 0);
  assert.ok(stickyIdx > transcriptIdx);
  assert.match(pageJsx, /HumanWhatsAppComposer/);
  assert.match(pageJsx, /variant="sticky"/);

  const pageCss = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.css"),
    "utf8"
  );
  assert.match(pageCss, /\.conversations-thread__composer-sticky\s*\{[^}]*position:\s*sticky/s);
  assert.match(pageCss, /\.conversations-thread__composer-sticky\s*\{[^}]*bottom:\s*0/s);
  assert.match(pageCss, /\.conversations-thread__transcript\s*\{[^}]*overflow:\s*auto/s);
  assert.match(pageCss, /\.conversations-thread__transcript\s*\{[^}]*padding:[^}]*24px/s);
});

test("thread header stacks identity above actions so long names do not collide", () => {
  assert.deepEqual(conversationsThreadHeaderRegionOrder(), ["identity", "actions"]);

  const pageCss = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.css"),
    "utf8"
  );
  assert.match(pageCss, /\.conversations-thread__header\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(pageCss, /\.conversations-thread__identity\s*\{[^}]*width:\s*100%/s);
  assert.match(pageCss, /\.conversations-thread__actions\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(pageCss, /\.conversations-thread__title\s*\{[^}]*overflow-wrap:\s*anywhere/s);

  const pageJsx = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.jsx"),
    "utf8"
  );
  assert.match(pageJsx, /data-testid="conversations-thread-identity"/);
  assert.match(pageJsx, /data-testid="conversations-thread-actions"/);
  assert.doesNotMatch(pageJsx, /conversationsHandoffReason/);
  assert.doesNotMatch(pageJsx, /handoffReason \?/);
});

test("OPEN IN MC / ABRIR EN MC labels; MC deep-link still uses prospectId", () => {
  assert.equal(translations.en.conversationsOpenInMissionControl, "OPEN IN MC");
  assert.equal(translations.es.conversationsOpenInMissionControl, "ABRIR EN MC");
  assert.doesNotMatch(
    translations.en.conversationsOpenInMissionControl,
    /MISSION CONTROL/i
  );

  const query = buildMissionControlQuery({
    prospectId: "29853100-f151-4ca8-b07d-624fd20c6685",
    phone: "+15555550100"
  });
  assert.match(
    query,
    new RegExp(`${MISSION_CONTROL_QUERY_KEYS.PROSPECT_ID}=29853100-f151-4ca8-b07d-624fd20c6685`)
  );
  assert.match(query, new RegExp(`${MISSION_CONTROL_QUERY_KEYS.PHONE}=%2B15555550100`));

  const pageJsx = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.jsx"),
    "utf8"
  );
  assert.match(
    pageJsx,
    /buildMissionControlPath\(\{\s*prospectId:\s*timelineProspectId/
  );
});

test("DAY_PART and handoff reason stay out of the normal Conversations header", () => {
  assert.equal(isUserFacingConversationGoal("DAY_PART"), false);
  assert.equal(isUserFacingConversationGoal("day_part"), false);
  assert.equal(isUserFacingConversationGoal("Interview Ready"), true);
  assert.equal(shouldShowHandoffReasonInHeader(), false);
  assert.equal(shouldShowHandoffReasonInHeader("take_over"), false);
});

test("Conversations Center newest-first keeps older messages deterministic below", () => {
  const ordered = orderCommunicationsForDisplay(
    [
      { id: "old", timestampUtc: "2026-08-01T10:00:00.000Z" },
      { id: "mid", timestampUtc: "2026-08-05T10:00:00.000Z" },
      { id: "new", timestampUtc: "2026-08-10T10:00:00.000Z" }
    ],
    { newestFirst: true }
  );
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["new", "mid", "old"]
  );
});
