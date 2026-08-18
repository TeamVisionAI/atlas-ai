/**
 * Native interview WhatsApp actions — Mission Control / Prospect Workspace.
 * Inside BR-075 customer-care window → shared HumanWhatsAppComposer freeform.
 * Outside window → approved Meta template path (no wa.me / copy-open).
 *
 * Opening never mutates ownership.
 */

import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";
import {
  isFreeformWhatsAppWindowOpen,
  normalizeCustomerCareWindow,
  openingHumanWhatsAppComposerChangesOwnership,
  shouldBlockFreeformWhatsAppSend
} from "./humanWhatsAppComposer.js";
import {
  APPOINTMENT_COMMUNICATION_PURPOSES,
  resolveAppointmentCommunicationPurpose
} from "./appointmentCommunicationEngine.js";

/** Interview WhatsApp actions migrated off wa.me / copy-open. */
export const NATIVE_INTERVIEW_WHATSAPP_ACTION_IDS = Object.freeze([
  COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
  COMMUNICATION_ACTION_IDS.SEND_ZOOM,
  COMMUNICATION_ACTION_IDS.SEND_REMINDER
]);

/** Canonical BR-078 Meta template names (docs + registry). Do not rename. */
export const CANONICAL_INTERVIEW_META_TEMPLATES = Object.freeze({
  interview_details: Object.freeze({
    english: "atlas_interview_details_en",
    spanish: "atlas_interview_details_es"
  }),
  interview_reminder: Object.freeze({
    english: "atlas_interview_reminder_en",
    spanish: "atlas_interview_reminder_es"
  }),
  zoom_invitation: Object.freeze({
    english: "atlas_zoom_invitation_en",
    spanish: "atlas_zoom_invitation_es"
  }),
  interview_confirmation: Object.freeze({
    english: "atlas_interview_confirmation_en",
    spanish: "atlas_interview_confirmation_es"
  })
});

const ACTION_TO_REGISTRY_KEY = Object.freeze({
  [COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS]: "interview_details",
  [COMMUNICATION_ACTION_IDS.SEND_REMINDER]: "interview_reminder",
  [COMMUNICATION_ACTION_IDS.SEND_ZOOM]: "zoom_invitation"
});

const ACTION_TO_PIPELINE_INTENT = Object.freeze({
  [COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS]: "INTERVIEW_DETAILS",
  [COMMUNICATION_ACTION_IDS.SEND_REMINDER]: "send_interview_reminder",
  [COMMUNICATION_ACTION_IDS.SEND_ZOOM]: "SEND_ZOOM_LINK"
});

export function isNativeInterviewWhatsAppAction(actionId) {
  return NATIVE_INTERVIEW_WHATSAPP_ACTION_IDS.includes(actionId);
}

export function openingNativeInterviewWhatsAppActionChangesOwnership() {
  return openingHumanWhatsAppComposerChangesOwnership();
}

export function resolveInterviewWhatsAppRegistryKey(actionId) {
  return ACTION_TO_REGISTRY_KEY[actionId] || null;
}

export function resolveInterviewWhatsAppPipelineIntent(actionId) {
  return ACTION_TO_PIPELINE_INTENT[actionId] || null;
}

/**
 * Prospect preferred language → registry locale (english|spanish).
 * Uses prospect/conversation language, not agent UI locale.
 */
export function resolveInterviewTemplateLocale({
  preferredLanguage = null,
  communicationLanguage = null,
  language = null
} = {}) {
  const raw = String(
    preferredLanguage || communicationLanguage || language || ""
  )
    .trim()
    .toLowerCase();

  if (!raw) {
    return "english";
  }

  if (
    raw === "es" ||
    raw === "spanish" ||
    raw === "spa" ||
    raw.startsWith("es-") ||
    raw.startsWith("es_")
  ) {
    return "spanish";
  }

  return "english";
}

export function resolveCanonicalInterviewMetaTemplateName(actionId, localeInput = {}) {
  const key = resolveInterviewWhatsAppRegistryKey(actionId);
  if (!key) {
    return null;
  }
  const locale = resolveInterviewTemplateLocale(localeInput);
  return CANONICAL_INTERVIEW_META_TEMPLATES[key]?.[locale] || null;
}

/**
 * @returns {"freeform_composer"|"approved_template"}
 */
export function resolveInterviewWhatsAppDeliveryMode(customerCareWindow) {
  const windowState = normalizeCustomerCareWindow(customerCareWindow);
  if (isFreeformWhatsAppWindowOpen(windowState)) {
    return "freeform_composer";
  }
  // Unknown or closed → never freeform outside an open window.
  return "approved_template";
}

export function shouldUseSharedComposerForInterviewAction(customerCareWindow) {
  return resolveInterviewWhatsAppDeliveryMode(customerCareWindow) === "freeform_composer";
}

export function shouldUseApprovedTemplateForInterviewAction(customerCareWindow) {
  return resolveInterviewWhatsAppDeliveryMode(customerCareWindow) === "approved_template";
}

export function shouldNavigateToWaMeForInterviewAction() {
  return false;
}

export function resolveInterviewWhatsAppPurpose(actionId) {
  if (!isNativeInterviewWhatsAppAction(actionId)) {
    return null;
  }
  return resolveAppointmentCommunicationPurpose(actionId);
}

export function buildInterviewComposerPrefill({
  actionId,
  previewMessage = null,
  phone = null,
  appointmentId = null
} = {}) {
  const sendPolicy = resolveInterviewComposerSendPolicy(actionId);
  return {
    actionId,
    purpose: resolveInterviewWhatsAppPurpose(actionId),
    phone: phone || null,
    appointmentId: appointmentId || null,
    message: String(previewMessage || "").trim(),
    deliveryMode: "freeform_composer",
    requiresHumanOwnership: sendPolicy.requiresHumanOwnership,
    sendVia: sendPolicy.sendVia
  };
}

/**
 * Interview-details composer may send under ATLAS ownership.
 * Custom / Zoom / reminder composers still require HUMAN (TAKE OVER).
 */
export function resolveInterviewComposerSendPolicy(actionId) {
  if (actionId === COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS) {
    return {
      requiresHumanOwnership: false,
      sendVia: "interview_details"
    };
  }
  return {
    requiresHumanOwnership: true,
    sendVia: "human_reply"
  };
}

export function buildInterviewTemplateConfirmModel({
  actionId,
  phone = null,
  appointmentId = null,
  language = null,
  preferredLanguage = null,
  communicationLanguage = null,
  metaTemplateName = null,
  customerCareWindow = null
} = {}) {
  const locale = resolveInterviewTemplateLocale({
    preferredLanguage,
    communicationLanguage,
    language
  });
  return {
    actionId,
    purpose: resolveInterviewWhatsAppPurpose(actionId),
    phone: phone || null,
    appointmentId: appointmentId || null,
    registryKey: resolveInterviewWhatsAppRegistryKey(actionId),
    pipelineIntent: resolveInterviewWhatsAppPipelineIntent(actionId),
    locale,
    metaTemplateName:
      metaTemplateName ||
      resolveCanonicalInterviewMetaTemplateName(actionId, {
        preferredLanguage,
        communicationLanguage,
        language
      }),
    deliveryMode: "approved_template",
    windowClosed: shouldBlockFreeformWhatsAppSend(customerCareWindow),
    opensWaMe: false
  };
}

export {
  APPOINTMENT_COMMUNICATION_PURPOSES,
  normalizeCustomerCareWindow,
  isFreeformWhatsAppWindowOpen,
  shouldBlockFreeformWhatsAppSend
};
