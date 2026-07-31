/**
 * Communication preview feature flag.
 * Default: enabled in development, configurable for production via VITE_COMMUNICATION_PREVIEW_ENABLED.
 */

export function isCommunicationPreviewEnabled() {
  const configured = import.meta.env.VITE_COMMUNICATION_PREVIEW_ENABLED;

  if (configured === "true") {
    return true;
  }

  if (configured === "false") {
    return false;
  }

  return import.meta.env.DEV;
}
