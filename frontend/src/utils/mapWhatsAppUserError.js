/**
 * Maps internal WhatsApp signup failures to user-friendly copy keys.
 */

export const WHATSAPP_ERROR_KEYS = Object.freeze({
  DEFAULT: "whatsappErrorDefault",
  CANCELLED: "whatsappErrorCancelled",
  TIMEOUT: "whatsappErrorTimeout",
  PERMISSIONS: "whatsappErrorPermissions",
  EXPIRED: "whatsappErrorExpired",
  EXCHANGE: "whatsappErrorExchange",
  CONFIG: "whatsappErrorConfig"
});

export function resolveWhatsAppErrorKey({ errorKey, message = "", stage = "", code = "" } = {}) {
  if (errorKey && WHATSAPP_ERROR_KEYS[errorKey]) {
    return WHATSAPP_ERROR_KEYS[errorKey];
  }

  const normalized = String(message || "").toLowerCase();
  const stageNormalized = String(stage || code || "").toLowerCase();

  if (
    normalized.includes("cancel") ||
    stageNormalized.includes("cancel") ||
    code === "CANCEL"
  ) {
    return WHATSAPP_ERROR_KEYS.CANCELLED;
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return WHATSAPP_ERROR_KEYS.TIMEOUT;
  }

  if (
    normalized.includes("already exchanged") ||
    normalized.includes("expired") ||
    code === "CODE_ALREADY_USED"
  ) {
    return WHATSAPP_ERROR_KEYS.EXPIRED;
  }

  if (
    stageNormalized.includes("oauth") ||
    stageNormalized.includes("permission") ||
    normalized.includes("permission")
  ) {
    return WHATSAPP_ERROR_KEYS.PERMISSIONS;
  }

  if (
    stageNormalized.includes("exchange") ||
    stageNormalized.includes("asset") ||
    stageNormalized.includes("subscribe") ||
    code === "EXCHANGE_FAILED"
  ) {
    return WHATSAPP_ERROR_KEYS.EXCHANGE;
  }

  if (code === "META_CONFIG_MISSING" || normalized.includes("not fully configured")) {
    return WHATSAPP_ERROR_KEYS.CONFIG;
  }

  return WHATSAPP_ERROR_KEYS.DEFAULT;
}

export function buildWhatsAppErrorNavigationState(details = {}) {
  return {
    errorKey: resolveWhatsAppErrorKey(details),
    ...details
  };
}
