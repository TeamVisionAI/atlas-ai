/**
 * Dev-only logging for WhatsApp Embedded Signup coordinator.
 * No output in production builds.
 */

const ENABLED = import.meta.env.DEV;

export function isWhatsAppConnectDebugEnabled() {
  return ENABLED;
}

export function whatsAppConnectDebug(...args) {
  if (ENABLED) {
    console.log("[whatsapp-connect]", ...args);
  }
}

export function whatsAppConnectWarn(...args) {
  if (ENABLED) {
    console.warn("[whatsapp-connect]", ...args);
  }
}

export function whatsAppConnectError(...args) {
  if (ENABLED) {
    console.error("[whatsapp-connect]", ...args);
  }
}
