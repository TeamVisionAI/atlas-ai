/**
 * Prospect Center background-refresh interaction model.
 * Keeps data fresh without replacing the visible list during operator interaction.
 */

export const PROSPECT_CENTER_POLL_INTERVAL_MS = 20_000;
export const PROSPECT_CENTER_SAFE_IDLE_APPLY_MS = 8_000;
export const PROSPECT_CENTER_SEARCH_ACTIVITY_MS = 1_500;

/**
 * Stable React key for a prospect row. Never use list index.
 * Prefer durable CRM identifiers over display order.
 */
export function getProspectRowKey(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.id) {
    return String(item.id);
  }

  if (item.prospectNumber) {
    return String(item.prospectNumber);
  }

  if (item.phone) {
    return String(item.phone);
  }

  return null;
}

function itemSignature(item) {
  if (!item) {
    return "";
  }

  const badges = item.badges || {};
  return [
    getProspectRowKey(item),
    item.ownerUserId || "",
    item.assignmentStatus || "",
    item.attentionStatus || "",
    item.acknowledgedAt || "",
    item.missionControlPriority ?? "",
    item.canonicalMilestone || "",
    badges.new ? "1" : "0",
    badges.unassigned ? "1" : "0",
    badges.humanAttention ? "1" : "0",
    badges.aiResponding ? "1" : "0",
    item.lastMessagePreview || ""
  ].join("|");
}

export function buildPayloadSignature(payload) {
  if (!payload) {
    return "";
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  return [
    payload.activeFilter || "",
    payload.search || "",
    payload.filteredCount ?? "",
    payload.totalCount ?? "",
    items.map(itemSignature).join("||")
  ].join("::");
}

export function payloadsDiffer(currentPayload, nextPayload) {
  return buildPayloadSignature(currentPayload) !== buildPayloadSignature(nextPayload);
}

/**
 * Count operator-visible differences between displayed and staged snapshots.
 */
export function countStagedUpdates(currentPayload, stagedPayload) {
  if (!stagedPayload) {
    return 0;
  }

  if (!currentPayload) {
    return Array.isArray(stagedPayload.items) ? stagedPayload.items.length : 1;
  }

  if (!payloadsDiffer(currentPayload, stagedPayload)) {
    return 0;
  }

  const currentItems = Array.isArray(currentPayload.items) ? currentPayload.items : [];
  const stagedItems = Array.isArray(stagedPayload.items) ? stagedPayload.items : [];
  const currentMap = new Map(currentItems.map((item) => [getProspectRowKey(item), item]));
  const stagedMap = new Map(stagedItems.map((item) => [getProspectRowKey(item), item]));

  let changes = 0;
  const keys = new Set([...currentMap.keys(), ...stagedMap.keys()]);

  for (const key of keys) {
    if (!key) {
      continue;
    }

    if (itemSignature(currentMap.get(key)) !== itemSignature(stagedMap.get(key))) {
      changes += 1;
    }
  }

  const currentOrder = currentItems.map(getProspectRowKey).join("|");
  const stagedOrder = stagedItems.map(getProspectRowKey).join("|");
  if (currentOrder !== stagedOrder && changes === 0) {
    return 1;
  }

  return Math.max(changes, 1);
}

export function shouldLockListReplacement(interaction = {}) {
  return Boolean(
    interaction.hoveringCard ||
      interaction.focusedInteractive ||
      interaction.searchActive ||
      interaction.filterChanging ||
      interaction.dialogOrMenuOpen ||
      interaction.mutationPending ||
      interaction.pointerDownInList
  );
}

export function isFocusedInteractiveElement(element, root = null) {
  if (!element || element === document.body || element === document.documentElement) {
    return false;
  }

  if (root && typeof root.contains === "function" && !root.contains(element)) {
    return false;
  }

  const tag = String(element.tagName || "").toLowerCase();
  if (["input", "textarea", "select", "button", "a"].includes(tag)) {
    return true;
  }

  if (element.isContentEditable) {
    return true;
  }

  const role = element.getAttribute?.("role");
  if (role === "tab" || role === "dialog" || role === "menu" || role === "listbox") {
    return true;
  }

  if (element.closest?.("[role='dialog'], [aria-modal='true'], .prospect-center-row__actions")) {
    return true;
  }

  return false;
}

/**
 * Decide how a completed poll/fetch should affect the visible list.
 */
export function decideRefreshApply({
  mode = "background",
  locked = false,
  requestGeneration,
  latestGeneration,
  currentPayload = null,
  nextPayload = null
} = {}) {
  if (
    requestGeneration != null &&
    latestGeneration != null &&
    requestGeneration !== latestGeneration
  ) {
    return { action: "ignore_stale", pending: null };
  }

  if (!nextPayload) {
    return { action: "noop", pending: null };
  }

  if (mode === "replace") {
    return { action: "apply", pending: null, payload: nextPayload };
  }

  if (!currentPayload) {
    return { action: "apply", pending: null, payload: nextPayload };
  }

  if (!payloadsDiffer(currentPayload, nextPayload)) {
    return { action: "noop", pending: null };
  }

  if (locked) {
    return { action: "stage", pending: nextPayload };
  }

  return { action: "apply", pending: null, payload: nextPayload };
}

export function canSafeAutoApply({
  locked = false,
  pendingPayload = null,
  idleMs = 0,
  idleThresholdMs = PROSPECT_CENTER_SAFE_IDLE_APPLY_MS
} = {}) {
  return Boolean(pendingPayload) && !locked && idleMs >= idleThresholdMs;
}

export function mergeOptimisticAcknowledge(payload, phone) {
  if (!payload || !phone) {
    return payload;
  }

  const items = (payload.items || []).map((item) => {
    if (item.phone !== phone) {
      return item;
    }

    return {
      ...item,
      acknowledgedAt: item.acknowledgedAt || new Date().toISOString(),
      attentionStatus: "acknowledged",
      isNew: false,
      badges: {
        ...(item.badges || {}),
        new: false,
        aiResponding: false
      }
    };
  });

  return { ...payload, items };
}

export function mergeOptimisticClaim(payload, phone, ownerUserId = "self") {
  if (!payload || !phone) {
    return payload;
  }

  const items = (payload.items || []).map((item) => {
    if (item.phone !== phone) {
      return item;
    }

    return {
      ...item,
      ownerUserId: ownerUserId || item.ownerUserId || "self",
      assignmentStatus: "assigned",
      isUnassigned: false,
      acknowledgedAt: item.acknowledgedAt || new Date().toISOString(),
      attentionStatus: "acknowledged",
      isNew: false,
      badges: {
        ...(item.badges || {}),
        unassigned: false,
        new: false,
        aiResponding: false
      }
    };
  });

  return { ...payload, items };
}

export function preserveScrollPosition(applyFn, getScrollY = () => window.scrollY, setScrollY = (y) => window.scrollTo(0, y)) {
  const y = getScrollY();
  applyFn();
  setScrollY(y);
  return y;
}
