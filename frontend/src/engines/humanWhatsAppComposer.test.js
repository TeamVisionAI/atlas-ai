import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHumanWhatsAppSendRequest,
  canSubmitHumanWhatsAppSend,
  isFreeformWhatsAppWindowOpen,
  isNativeHumanWhatsAppComposerAction,
  normalizeCustomerCareWindow,
  openingHumanWhatsAppComposerChangesOwnership,
  resolveHumanWhatsAppComposerEnabled,
  resolveHumanWhatsAppComposerPhone,
  shouldBlockFreeformWhatsAppSend
} from "./humanWhatsAppComposer.js";
import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("Custom WhatsApp / Contact by WhatsApp opens native shared composer", () => {
  assert.equal(
    isNativeHumanWhatsAppComposerAction(COMMUNICATION_ACTION_IDS.CUSTOM),
    true
  );
  assert.equal(isNativeHumanWhatsAppComposerAction("whatsapp"), true);
  assert.equal(isNativeHumanWhatsAppComposerAction("send_missed_appointment"), false);
  assert.equal(isNativeHumanWhatsAppComposerAction("send_zoom_link"), false);
});

test("composer binds to canonical prospect phone", () => {
  assert.equal(
    resolveHumanWhatsAppComposerPhone({
      phone: "+15555550100",
      workspacePhone: "+15555550999",
      prospectPhone: "+15555550888"
    }),
    "+15555550100"
  );
  assert.equal(
    resolveHumanWhatsAppComposerPhone({
      workspacePhone: "+15555550999",
      prospectPhone: "+15555550888"
    }),
    "+15555550999"
  );
  assert.equal(resolveHumanWhatsAppComposerPhone({}), null);
});

test("opening the composer never changes ownership", () => {
  assert.equal(openingHumanWhatsAppComposerChangesOwnership(), false);
});

test("empty message disables send; HUMAN ownership required", () => {
  assert.equal(resolveHumanWhatsAppComposerEnabled("HUMAN"), true);
  assert.equal(resolveHumanWhatsAppComposerEnabled("ATLAS"), false);

  assert.equal(
    canSubmitHumanWhatsAppSend({
      phone: "+15555550100",
      message: "Hola",
      ownershipState: "HUMAN",
      customerCareWindow: { open: true },
      windowKnown: true
    }),
    true
  );
  assert.equal(
    canSubmitHumanWhatsAppSend({
      phone: "+15555550100",
      message: "   ",
      ownershipState: "HUMAN",
      customerCareWindow: { open: true },
      windowKnown: true
    }),
    false
  );
  assert.equal(
    canSubmitHumanWhatsAppSend({
      phone: "+15555550100",
      message: "Hola",
      ownershipState: "ATLAS",
      customerCareWindow: { open: true },
      windowKnown: true
    }),
    false
  );
});

test("send request reuses Conversations human-reply payload shape", () => {
  assert.deepEqual(
    buildHumanWhatsAppSendRequest({
      phone: "+15555550100",
      message: "  Hello from MC  ",
      clientRequestId: "req-12345678"
    }),
    {
      phone: "+15555550100",
      message: "Hello from MC",
      clientRequestId: "req-12345678"
    }
  );

  const service = fs.readFileSync(
    path.join(root, "services/conversationsCenterService.js"),
    "utf8"
  );
  assert.match(service, /\/api\/conversations\/human-reply/);
  assert.match(service, /export async function sendHumanConversationReply/);

  const composer = fs.readFileSync(
    path.join(root, "components/communication/HumanWhatsAppComposer.jsx"),
    "utf8"
  );
  assert.match(composer, /sendHumanConversationReply/);
  assert.doesNotMatch(composer, /takeOverConversation/);
  assert.doesNotMatch(composer, /openWhatsAppConversation/);
  assert.doesNotMatch(composer, /copyMessageToClipboard/);
});

test("24-hour window: open allows freeform; closed blocks and warns", () => {
  assert.equal(isFreeformWhatsAppWindowOpen({ open: true }), true);
  assert.equal(shouldBlockFreeformWhatsAppSend({ open: false }), true);
  assert.equal(shouldBlockFreeformWhatsAppSend({ open: true }), false);
  assert.equal(
    canSubmitHumanWhatsAppSend({
      phone: "+15555550100",
      message: "Hola",
      ownershipState: "HUMAN",
      customerCareWindow: { open: false },
      windowKnown: true
    }),
    false
  );
  assert.equal(
    canSubmitHumanWhatsAppSend({
      phone: "+15555550100",
      message: "Hola",
      ownershipState: "HUMAN",
      customerCareWindow: { open: true },
      windowKnown: true
    }),
    true
  );

  const composer = fs.readFileSync(
    path.join(root, "components/communication/HumanWhatsAppComposer.jsx"),
    "utf8"
  );
  assert.match(composer, /conversationsComposerWindowClosed/);
  assert.match(composer, /window-warning/);
  assert.doesNotMatch(composer, /invalid_grant|GRAPH_API|access token/i);
});

test("normalizeCustomerCareWindow keeps only safe fields", () => {
  assert.deepEqual(
    normalizeCustomerCareWindow({
      open: true,
      reason: "WINDOW_OPEN",
      latestInboundAt: "2026-08-12T00:00:00.000Z",
      expiresAt: "2026-08-13T00:00:00.000Z",
      windowMs: 86400000,
      secret: "nope"
    }),
    {
      open: true,
      reason: "WINDOW_OPEN",
      latestInboundAt: "2026-08-12T00:00:00.000Z",
      expiresAt: "2026-08-13T00:00:00.000Z",
      windowMs: 86400000
    }
  );
  assert.equal(normalizeCustomerCareWindow(null), null);
});

test("Mission Control and Prospect Workspace open shared composer for custom WhatsApp", () => {
  const dashboard = fs.readFileSync(path.join(root, "pages/Dashboard.jsx"), "utf8");
  assert.match(dashboard, /isNativeHumanWhatsAppComposerAction/);
  assert.match(dashboard, /HumanWhatsAppComposer/);
  assert.match(dashboard, /mc-custom-whatsapp-composer/);
  assert.match(dashboard, /setCustomWhatsAppComposerOpen\(true\)/);

  const workspaceActions = fs.readFileSync(
    path.join(root, "features/prospect-workspace/hooks/useWorkspaceActions.js"),
    "utf8"
  );
  assert.match(workspaceActions, /isNativeHumanWhatsAppComposerAction/);
  assert.match(workspaceActions, /openCustomWhatsAppComposer/);

  const operational = fs.readFileSync(
    path.join(root, "features/prospect-workspace/components/OperationalWorkspace.jsx"),
    "utf8"
  );
  assert.match(operational, /HumanWhatsAppComposer/);
  assert.match(operational, /workspace-custom-whatsapp-composer/);
  assert.doesNotMatch(
    workspaceActions.slice(
      workspaceActions.indexOf("isNativeHumanWhatsAppComposerAction"),
      workspaceActions.indexOf("isWhatsAppCopyAction")
    ),
    /executeCommunicationAction/
  );
});

test("migrated custom-message path no longer uses copy/open for whatsapp action in hosts", () => {
  const dashboard = fs.readFileSync(path.join(root, "pages/Dashboard.jsx"), "utf8");
  // Native composer branch precedes copy/open branch.
  const nativeIdx = dashboard.indexOf("isNativeHumanWhatsAppComposerAction(actionId)");
  const copyIdx = dashboard.indexOf("isWhatsAppCopyAction(actionId)");
  assert.ok(nativeIdx > 0 && copyIdx > nativeIdx);

  // Missed-appointment and other copy actions remain available.
  const waService = fs.readFileSync(
    path.join(root, "services/whatsappCommunicationService.js"),
    "utf8"
  );
  assert.match(waService, /send_missed_appointment/);
  assert.match(waService, /openWhatsAppConversation/);
});
