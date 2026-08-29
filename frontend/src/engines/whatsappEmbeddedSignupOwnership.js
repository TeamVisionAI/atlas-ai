/**
 * BR-147 — Personal vs organization Embedded Signup access and connection state.
 * Org reconnect must not depend on personalWhatsAppEnabled or personal status.
 */

export const OWNERSHIP_PERSONAL = "personal";
export const OWNERSHIP_ORGANIZATION = "organization";

export function resolveWhatsAppSignupOwnership(search) {
  const raw =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
          "ownership"
        )
      : typeof search?.get === "function"
        ? search.get("ownership")
        : null;

  return String(raw || "").trim().toLowerCase() === OWNERSHIP_ORGANIZATION
    ? OWNERSHIP_ORGANIZATION
    : OWNERSHIP_PERSONAL;
}

export function isPersonalWhatsAppEnabled(user) {
  return (
    user?.capabilities?.personalWhatsAppEnabled === true ||
    user?.agent_capabilities?.personalWhatsAppEnabled === true
  );
}

export function resolveWhatsAppConnectAccess({
  ownershipMode,
  userLoaded,
  personalWhatsAppEnabled,
  canWriteOrg
} = {}) {
  if (!userLoaded) {
    return { allowed: true, redirectToIntegrations: false, reason: null };
  }

  if (ownershipMode === OWNERSHIP_ORGANIZATION) {
    if (!canWriteOrg) {
      return {
        allowed: false,
        redirectToIntegrations: true,
        reason: "ORG_WRITE_REQUIRED"
      };
    }
    return { allowed: true, redirectToIntegrations: false, reason: null };
  }

  if (personalWhatsAppEnabled !== true) {
    return {
      allowed: false,
      redirectToIntegrations: true,
      reason: "PERSONAL_WHATSAPP_DISABLED"
    };
  }

  return { allowed: true, redirectToIntegrations: false, reason: null };
}

export function selectEmbeddedSignupConnectionState(statusPayload, ownershipMode) {
  if (ownershipMode === OWNERSHIP_ORGANIZATION) {
    const org = statusPayload?.organizationChannel || {};
    return {
      connected: org.connected === true && Boolean(org.connection),
      connection: org.connection || null
    };
  }

  return {
    connected: statusPayload?.connected === true && Boolean(statusPayload?.connection),
    connection: statusPayload?.connection || null
  };
}

export function resolveEmbeddedSignupLaunchBlocker({
  ready = false,
  appId = null,
  configId = null,
  hasFacebookSdk = false,
  sdkError = null
} = {}) {
  if (!appId || !configId || sdkError === "missing_config") {
    return "missing_config";
  }
  if (sdkError === "sdk_load_failed") {
    return "sdk_load_failed";
  }
  if (!ready || !hasFacebookSdk) {
    return "sdk_not_ready";
  }
  return null;
}

export function buildWhatsAppConnectHref(basePath, ownershipMode) {
  const path = String(basePath || "").trim() || "/app/settings/whatsapp";
  if (ownershipMode === OWNERSHIP_ORGANIZATION) {
    return `${path}?ownership=organization`;
  }
  return path;
}

export function normalizeOwnershipMode(value) {
  return String(value || "").trim().toLowerCase() === OWNERSHIP_ORGANIZATION
    ? OWNERSHIP_ORGANIZATION
    : OWNERSHIP_PERSONAL;
}
