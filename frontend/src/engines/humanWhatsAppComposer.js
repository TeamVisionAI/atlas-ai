/**
 * Shared Human WhatsApp composer helpers (Conversations / Mission Control /
 * Prospect Workspace). Presentation and send-gating only.
 *
 * Opening the composer must never mutate ownership. Send reuses Conversations
 * human-reply (`sendHumanConversationReply` → `/api/conversations/human-reply`)
 * and its HUMAN ownership + BR-075 window gate.
 */

import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";
import {
  isHumanComposerEnabled,
  resolveEffectiveOwnership
} from "./conversationsCenterPresentation.js";

/** Custom / Contact-by-WhatsApp action — opens native composer (not copy/open). */
export function isNativeHumanWhatsAppComposerAction(actionId) {
  return (
    actionId === COMMUNICATION_ACTION_IDS.CUSTOM || actionId === "whatsapp"
  );
}

/**
 * Canonical phone for the open composer. Does not load or mutate ownership.
 */
export function resolveHumanWhatsAppComposerPhone({
  phone = null,
  workspacePhone = null,
  prospectPhone = null
} = {}) {
  return phone || workspacePhone || prospectPhone || null;
}

/** Opening the composer is UI-only — never TAKE OVER / RETURN / ownership writes. */
export function openingHumanWhatsAppComposerChangesOwnership() {
  return false;
}

export function resolveHumanWhatsAppComposerEnabled(ownershipState) {
  return isHumanComposerEnabled(resolveEffectiveOwnership(ownershipState));
}

/**
 * Payload shape for sendHumanConversationReply — same Conversations production path.
 */
export function buildHumanWhatsAppSendRequest({
  phone,
  message,
  clientRequestId
} = {}) {
  return {
    phone: phone || null,
    message: String(message || "").trim(),
    clientRequestId: clientRequestId || null
  };
}

/**
 * Sanitize customer-care window from conversation detail (BR-075).
 * Unknown / missing → treat as not yet known (caller decides loading UX).
 */
export function normalizeCustomerCareWindow(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (typeof raw.open !== "boolean") {
    return null;
  }
  return {
    open: raw.open,
    reason: raw.reason || null,
    latestInboundAt: raw.latestInboundAt || null,
    expiresAt: raw.expiresAt || null,
    windowMs: Number.isFinite(raw.windowMs) ? raw.windowMs : null
  };
}

export function isFreeformWhatsAppWindowOpen(windowState) {
  return normalizeCustomerCareWindow(windowState)?.open === true;
}

/** When window is known closed, freeform send must be blocked in the UI. */
export function shouldBlockFreeformWhatsAppSend(windowState) {
  return normalizeCustomerCareWindow(windowState)?.open === false;
}

export function canSubmitHumanWhatsAppSend({
  phone,
  message,
  ownershipState,
  sending = false,
  customerCareWindow = null,
  windowKnown = true
} = {}) {
  if (sending) {
    return false;
  }
  if (!phone || !String(message || "").trim()) {
    return false;
  }
  if (!resolveHumanWhatsAppComposerEnabled(ownershipState)) {
    return false;
  }
  if (!windowKnown) {
    return false;
  }
  if (shouldBlockFreeformWhatsAppSend(customerCareWindow)) {
    return false;
  }
  return true;
}
