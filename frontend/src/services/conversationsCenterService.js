/**
 * Conversations Center API — Niovel-only production pilot.
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

async function wrap(path, options) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    throw new ConversationsCenterError(
      error.message || "Conversations Center request failed",
      error.status || 500,
      error.code || null
    );
  }
}

export async function getConversations({ filter = "active", search = "" } = {}) {
  const params = new URLSearchParams();
  if (filter && filter !== "active") {
    params.set("filter", filter);
  }
  if (search) {
    params.set("q", search);
  }
  const query = params.toString();
  return wrap(`/api/conversations${query ? `?${query}` : ""}`);
}

export async function getConversationsAttentionCount() {
  return wrap("/api/conversations/attention-count");
}

export async function getConversation(phone) {
  return wrap(`/api/conversations/${encodeURIComponent(phone)}`);
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
