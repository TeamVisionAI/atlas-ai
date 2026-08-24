/**
 * WhatsApp sender identity — phone E.164 and/or Meta BSUID (username rollout).
 * Existing phone-based conversations continue unchanged when phone is present.
 */

const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("./phoneNormalizer");

const SYNTHETIC_BSUID_PREFIX = "wa:bsuid:";

function stripUsernamePrefix(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  return raw.replace(/^@+/, "");
}

function looksLikeE164Phone(value) {
  const raw = String(value || "").trim();
  if (!raw || /^whatsapp:/i.test(raw)) {
    return false;
  }
  if (/[a-zA-Z._-]/.test(raw.replace(/^\+/, ""))) {
    return false;
  }
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function resolvePhoneE164(...candidates) {
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw || !looksLikeE164Phone(raw)) {
      continue;
    }
    const normalized = normalizePhoneNumber(raw);
    if (normalized) {
      return formatPhoneForStorage(normalized);
    }
  }
  return null;
}

function resolveContactForMessage(message, contacts = []) {
  const from = String(message?.from || "").trim();
  if (!from) {
    return null;
  }

  for (const contact of contacts || []) {
    const waId = String(contact?.wa_id || "").trim();
    const userId = String(contact?.user_id || contact?.userId || "").trim();
    if (userId && userId === from) {
      return contact;
    }
    if (waId && (waId === from || from.endsWith(waId))) {
      return contact;
    }
  }

  return contacts?.[0] || null;
}

function buildWhatsAppStorageKey({ phoneE164 = null, whatsappSenderId = null } = {}) {
  if (phoneE164) {
    return phoneE164;
  }
  const senderId = String(whatsappSenderId || "").trim();
  if (!senderId) {
    return null;
  }
  return `${SYNTHETIC_BSUID_PREFIX}${senderId}`;
}

function isSyntheticWhatsAppStorageKey(value) {
  return String(value || "").trim().startsWith(SYNTHETIC_BSUID_PREFIX);
}

function extractWhatsAppSenderIdFromStorageKey(storageKey) {
  const raw = String(storageKey || "").trim();
  if (!isSyntheticWhatsAppStorageKey(raw)) {
    return null;
  }
  return raw.slice(SYNTHETIC_BSUID_PREFIX.length) || null;
}

/**
 * @param {object} message — Meta webhook message
 * @param {object|null} contact — matching contacts[] entry
 * @param {string|null} fallbackName — value.contacts[0].profile.name
 */
function extractWhatsAppSenderIdentity(message, contact = null, fallbackName = null) {
  const from = String(message?.from || "").trim();
  const whatsappSenderId = String(
    contact?.user_id || contact?.userId || from || ""
  ).trim();
  const phoneE164 = resolvePhoneE164(contact?.wa_id, contact?.phone_number, from);
  const whatsappUsername = stripUsernamePrefix(contact?.username);
  const displayName = String(contact?.profile?.name || fallbackName || "").trim() || null;
  const storageKey = buildWhatsAppStorageKey({ phoneE164, whatsappSenderId });

  if (!whatsappSenderId || !storageKey) {
    return {
      whatsappSenderId: whatsappSenderId || null,
      phoneE164,
      whatsappUsername: whatsappUsername || null,
      displayName,
      storageKey: null,
      identityType: null,
      isUsable: false,
      reason: "WHATSAPP_SENDER_IDENTITY_UNUSABLE"
    };
  }

  return {
    whatsappSenderId,
    phoneE164,
    whatsappUsername: whatsappUsername || null,
    displayName,
    storageKey,
    identityType: phoneE164 ? "phone" : "bsuid",
    isUsable: true,
    reason: null
  };
}

function resolveWhatsAppSenderIdentityFromInbound(inbound = {}) {
  if (inbound.senderIdentity?.isUsable) {
    return inbound.senderIdentity;
  }

  const identity = extractWhatsAppSenderIdentity(
    inbound.rawMessage || { from: inbound.phone || inbound.whatsappSenderId },
    inbound.rawContact || null,
    inbound.contactName || null
  );

  if (identity.isUsable) {
    return identity;
  }

  const storageKey = buildWhatsAppStorageKey({
    phoneE164: resolvePhoneE164(inbound.phone),
    whatsappSenderId: inbound.whatsappSenderId || inbound.phone
  });

  if (!storageKey) {
    return identity;
  }

  return {
    whatsappSenderId: String(inbound.whatsappSenderId || inbound.phone || "").trim(),
    phoneE164: resolvePhoneE164(inbound.phone),
    whatsappUsername: stripUsernamePrefix(inbound.whatsappUsername) || null,
    displayName: inbound.contactName || null,
    storageKey,
    identityType: resolvePhoneE164(inbound.phone) ? "phone" : "bsuid",
    isUsable: true,
    reason: null
  };
}

function resolveMetaWhatsAppRecipient({ storageKey = null, phoneE164 = null, whatsappSenderId = null, normalizedPhone = null } = {}) {
  const linkedPhone = resolvePhoneE164(phoneE164, normalizedPhone, storageKey);
  if (linkedPhone) {
    return normalizePhoneNumber(linkedPhone) || String(linkedPhone).replace(/\D/g, "");
  }
  const senderId =
    whatsappSenderId || extractWhatsAppSenderIdFromStorageKey(storageKey) || null;
  if (senderId) {
    return String(senderId).trim();
  }
  if (looksLikeE164Phone(storageKey)) {
    return normalizePhoneNumber(storageKey) || String(storageKey).replace(/\D/g, "");
  }
  return String(storageKey || "").trim() || null;
}

function formatProspectWhatsAppDisplayIdentity(prospect = {}) {
  const username = stripUsernamePrefix(prospect.whatsapp_username);
  if (username) {
    return `@${username}`;
  }
  const name = String(prospect.name || "").trim();
  if (name && name !== "Unknown") {
    return name;
  }
  if (prospect.phone && !isSyntheticWhatsAppStorageKey(prospect.phone)) {
    return prospect.phone;
  }
  if (prospect.whatsapp_sender_id) {
    return `WhatsApp user ${String(prospect.whatsapp_sender_id).slice(0, 8)}…`;
  }
  return prospect.phone || "WhatsApp lead";
}

function mergeWhatsAppSenderIdentityOntoProspect(prospect = {}, identity = {}) {
  const updates = {};
  const nextSenderId = String(identity.whatsappSenderId || prospect.whatsapp_sender_id || "").trim();
  const nextUsername = stripUsernamePrefix(
    identity.whatsappUsername || prospect.whatsapp_username
  );
  const nextPhoneE164 = resolvePhoneE164(identity.phoneE164, prospect.normalized_phone, prospect.phone);

  if (nextSenderId && nextSenderId !== prospect.whatsapp_sender_id) {
    updates.whatsapp_sender_id = nextSenderId;
  }
  if (nextUsername && nextUsername !== prospect.whatsapp_username) {
    updates.whatsapp_username = nextUsername;
  }

  if (nextPhoneE164 && !prospect.normalized_phone) {
    updates.normalized_phone = normalizePhoneNumber(nextPhoneE164);
  }

  const nextName = String(identity.displayName || "").trim();
  if (nextName && (!prospect.name || prospect.name === "Unknown")) {
    updates.name = nextName;
  }

  return updates;
}

module.exports = {
  SYNTHETIC_BSUID_PREFIX,
  looksLikeE164Phone,
  resolveContactForMessage,
  extractWhatsAppSenderIdentity,
  resolveWhatsAppSenderIdentityFromInbound,
  buildWhatsAppStorageKey,
  isSyntheticWhatsAppStorageKey,
  extractWhatsAppSenderIdFromStorageKey,
  resolveMetaWhatsAppRecipient,
  formatProspectWhatsAppDisplayIdentity,
  mergeWhatsAppSenderIdentityOntoProspect
};
