/**
 * Conversations Center API — tenant-scoped (feature + RBAC).
 */

import { apiFetch } from "./apiClient";

export class ConversationsCenterError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ConversationsCenterError";
    this.status = status;
    this.code = code;
  }
}

const LIST_CACHE_TTL_MS = 20000;
const listCache = new Map();
const listInFlight = new Map();
const detailCache = new Map();

function detailCacheKey(organizationId, phone) {
  return `${organizationId || "none"}::${String(phone)}`;
}

async function wrap(path, options) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    const wrapped = new ConversationsCenterError(
      error.message || "Conversations Center request failed",
      error.status || 500,
      error.code || null
    );
    if (error.delivery) {
      wrapped.delivery = error.delivery;
    }
    throw wrapped;
  }
}

function listCacheKey({
  organizationId = "",
  filter = "active",
  search = "",
  view = "summary"
} = {}) {
  return `${organizationId || "none"}::${filter}::${search}::${view}`;
}

export function conversationsListCacheKey(options = {}) {
  return listCacheKey(options);
}

export function clearConversationsCaches() {
  listCache.clear();
  listInFlight.clear();
  detailCache.clear();
}

export function readConversationsListCache(key) {
  const entry = listCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.at > LIST_CACHE_TTL_MS) {
    listCache.delete(key);
    return null;
  }
  return entry.data;
}

export function writeConversationsListCache(key, data) {
  listCache.set(key, { at: Date.now(), data });
}

export function patchConversationsListCache(key, patchFn) {
  const entry = listCache.get(key);
  if (!entry?.data || typeof patchFn !== "function") {
    return null;
  }
  const next = patchFn(entry.data);
  listCache.set(key, { at: Date.now(), data: next });
  return next;
}

export async function getConversationsCenterAccess() {
  return wrap("/api/conversations/access");
}

export async function getConversations({
  organizationId = "",
  filter = "active",
  search = "",
  view = "summary",
  force = false
} = {}) {
  const cacheKey = listCacheKey({ organizationId, filter, search, view });

  if (!force) {
    const cached = readConversationsListCache(cacheKey);
    if (cached) {
      return cached;
    }
    const inFlight = listInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const params = new URLSearchParams();
  if (filter && filter !== "active") {
    params.set("filter", filter);
  }
  if (search) {
    params.set("q", search);
  }
  if (view && view !== "full") {
    params.set("view", view);
  }
  const query = params.toString();

  const pending = wrap(`/api/conversations${query ? `?${query}` : ""}`)
    .then((data) => {
      writeConversationsListCache(cacheKey, data);
      return data;
    })
    .finally(() => {
      listInFlight.delete(cacheKey);
    });

  listInFlight.set(cacheKey, pending);
  return pending;
}

export async function getConversationsAttentionCount() {
  return wrap("/api/conversations/attention-count");
}

export async function getConversation(phone, { organizationId = "", force = false } = {}) {
  if (!phone) {
    throw new ConversationsCenterError("Phone is required.", 400);
  }

  const cacheKey = detailCacheKey(organizationId, phone);
  if (!force) {
    const cached = detailCache.get(cacheKey);
    if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const data = await wrap(`/api/conversations/${encodeURIComponent(phone)}`);
  detailCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function patchConversationDetailCache(phone, patchFn, organizationId = "") {
  if (!phone || typeof patchFn !== "function") {
    return null;
  }

  const suffix = `::${String(phone)}`;
  let patched = null;
  for (const [key, entry] of detailCache) {
    if (!entry?.data) {
      continue;
    }
    if (organizationId && key !== detailCacheKey(organizationId, phone)) {
      continue;
    }
    if (!organizationId && !key.endsWith(suffix)) {
      continue;
    }
    const next = patchFn(entry.data);
    detailCache.set(key, { at: Date.now(), data: next });
    patched = next;
  }
  return patched;
}

/**
 * Atomically patch list + detail caches after ownership mutation.
 * Returns patched detail row when the selected phone matches.
 */
export function applyConversationOwnershipPatch(
  phone,
  { ownershipState, workflow = {} } = {}
) {
  if (!phone || !ownershipState) {
    return null;
  }

  const patchRow = (row) => {
    if (!row || row.phone !== phone) {
      return row;
    }
    return {
      ...row,
      ownershipState,
      needsHumanAttention: Boolean(workflow.needsHumanAttention),
      manualAgentOwnership: Boolean(workflow.manualAgentOwnership)
    };
  };

  for (const [key] of listCache) {
    patchConversationsListCache(key, (data) => {
      if (!data?.items?.length) {
        return data;
      }
      return {
        ...data,
        items: data.items.map(patchRow)
      };
    });
  }

  return patchConversationDetailCache(phone, (detail) => {
    if (!detail) {
      return detail;
    }
    const conversation = detail.conversation
      ? {
          ...detail.conversation,
          ownershipState,
          needsHumanAttention: Boolean(workflow.needsHumanAttention)
        }
      : detail.conversation;
    return {
      ...detail,
      ownershipState,
      needsHumanAttention: Boolean(workflow.needsHumanAttention),
      conversation
    };
  });
}

export async function takeOverConversation(phone, body = {}) {
  return wrap(`/api/conversations/take-over`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, phone })
  });
}

export async function returnConversationToAtlas(phone) {
  return wrap(`/api/conversations/return-to-atlas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
}

export async function sendHumanConversationReply(phone, { message, clientRequestId }) {
  return wrap(`/api/conversations/human-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message, clientRequestId })
  });
}

export async function archiveConversation(phone) {
  return wrap(`/api/conversations/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
}

export async function restoreConversation(phone) {
  return wrap(`/api/conversations/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
}

export async function closeConversation(phone, reason = "OTHER") {
  return wrap(`/api/conversations/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, reason })
  });
}

export async function markConversationAsTest(phone) {
  return wrap(`/api/conversations/mark-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
}

/** Messaging unread only — does not acknowledge BR-080 or mutate ownership. */
export async function markConversationRead(phone, body = {}) {
  return wrap(`/api/conversations/mark-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      lastReadInboundAt: body.lastReadInboundAt || null,
      lastSeenInboundMessageId: body.lastSeenInboundMessageId || null
    })
  });
}
