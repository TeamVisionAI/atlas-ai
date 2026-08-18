import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildInterviewComposerPrefill,
  buildInterviewTemplateConfirmModel,
  CANONICAL_INTERVIEW_META_TEMPLATES,
  isNativeInterviewWhatsAppAction,
  openingNativeInterviewWhatsAppActionChangesOwnership,
  resolveCanonicalInterviewMetaTemplateName,
  resolveInterviewTemplateLocale,
  resolveInterviewComposerSendPolicy,
  resolveInterviewWhatsAppDeliveryMode,
  resolveInterviewWhatsAppRegistryKey,
  shouldNavigateToWaMeForInterviewAction,
  shouldUseApprovedTemplateForInterviewAction,
  shouldUseSharedComposerForInterviewAction
} from "./nativeInterviewWhatsAppActions.js";
import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";
import { translations } from "../i18n/translations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("native interview actions are details, zoom, and reminder only", () => {
  assert.equal(
    isNativeInterviewWhatsAppAction(COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS),
    true
  );
  assert.equal(isNativeInterviewWhatsAppAction(COMMUNICATION_ACTION_IDS.SEND_ZOOM), true);
  assert.equal(
    isNativeInterviewWhatsAppAction(COMMUNICATION_ACTION_IDS.SEND_REMINDER),
    true
  );
  assert.equal(isNativeInterviewWhatsAppAction(COMMUNICATION_ACTION_IDS.SEND_OFFICE), false);
  assert.equal(isNativeInterviewWhatsAppAction(COMMUNICATION_ACTION_IDS.CUSTOM), false);
});

test("canonical Meta template names match BR-078 registry audit", () => {
  assert.deepEqual(CANONICAL_INTERVIEW_META_TEMPLATES.interview_details, {
    english: "atlas_interview_details_en",
    spanish: "atlas_interview_details_es"
  });
  assert.deepEqual(CANONICAL_INTERVIEW_META_TEMPLATES.interview_reminder, {
    english: "atlas_interview_reminder_en",
    spanish: "atlas_interview_reminder_es"
  });
  assert.deepEqual(CANONICAL_INTERVIEW_META_TEMPLATES.zoom_invitation, {
    english: "atlas_zoom_invitation_en",
    spanish: "atlas_zoom_invitation_es"
  });
  assert.deepEqual(CANONICAL_INTERVIEW_META_TEMPLATES.interview_confirmation, {
    english: "atlas_interview_confirmation_en",
    spanish: "atlas_interview_confirmation_es"
  });
});

test("inside 24h uses shared composer prefill for all three interview actions", () => {
  const open = { open: true };
  assert.equal(resolveInterviewWhatsAppDeliveryMode(open), "freeform_composer");
  assert.equal(shouldUseSharedComposerForInterviewAction(open), true);

  for (const actionId of [
    COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
    COMMUNICATION_ACTION_IDS.SEND_ZOOM,
    COMMUNICATION_ACTION_IDS.SEND_REMINDER
  ]) {
    const prefill = buildInterviewComposerPrefill({
      actionId,
      previewMessage: "  Hello interview  ",
      phone: "+15555550100",
      appointmentId: "appt-1"
    });
    assert.equal(prefill.deliveryMode, "freeform_composer");
    assert.equal(prefill.message, "Hello interview");
    assert.equal(prefill.phone, "+15555550100");
  }
});

test("interview details send under ATLAS; zoom and reminder still require HUMAN", () => {
  assert.deepEqual(
    resolveInterviewComposerSendPolicy(
      COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS
    ),
    { requiresHumanOwnership: false, sendVia: "interview_details" }
  );
  assert.deepEqual(
    resolveInterviewComposerSendPolicy(COMMUNICATION_ACTION_IDS.SEND_ZOOM),
    { requiresHumanOwnership: true, sendVia: "human_reply" }
  );
  assert.deepEqual(
    resolveInterviewComposerSendPolicy(COMMUNICATION_ACTION_IDS.SEND_REMINDER),
    { requiresHumanOwnership: true, sendVia: "human_reply" }
  );

  const details = buildInterviewComposerPrefill({
    actionId: COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
    previewMessage: "Details",
    phone: "+15555550100",
    appointmentId: "appt-1"
  });
  assert.equal(details.requiresHumanOwnership, false);
  assert.equal(details.sendVia, "interview_details");

  const zoom = buildInterviewComposerPrefill({
    actionId: COMMUNICATION_ACTION_IDS.SEND_ZOOM,
    previewMessage: "Zoom",
    phone: "+15555550100",
    appointmentId: "appt-1"
  });
  assert.equal(zoom.requiresHumanOwnership, true);
  assert.equal(zoom.sendVia, "human_reply");
});

test("outside 24h uses approved template path and never wa.me", () => {
  const closed = { open: false, reason: "WINDOW_EXPIRED" };
  assert.equal(resolveInterviewWhatsAppDeliveryMode(closed), "approved_template");
  assert.equal(shouldUseApprovedTemplateForInterviewAction(closed), true);
  assert.equal(shouldNavigateToWaMeForInterviewAction(), false);

  const details = buildInterviewTemplateConfirmModel({
    actionId: COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
    preferredLanguage: "spanish",
    customerCareWindow: closed
  });
  assert.equal(details.metaTemplateName, "atlas_interview_details_es");
  assert.equal(details.opensWaMe, false);
  assert.equal(details.deliveryMode, "approved_template");

  const zoom = buildInterviewTemplateConfirmModel({
    actionId: COMMUNICATION_ACTION_IDS.SEND_ZOOM,
    communicationLanguage: "en",
    customerCareWindow: closed
  });
  assert.equal(zoom.metaTemplateName, "atlas_zoom_invitation_en");

  const reminder = buildInterviewTemplateConfirmModel({
    actionId: COMMUNICATION_ACTION_IDS.SEND_REMINDER,
    language: "es",
    customerCareWindow: closed
  });
  assert.equal(reminder.metaTemplateName, "atlas_interview_reminder_es");
});

test("prospect language selects en/es templates (not agent UI locale)", () => {
  assert.equal(resolveInterviewTemplateLocale({ preferredLanguage: "spanish" }), "spanish");
  assert.equal(resolveInterviewTemplateLocale({ communicationLanguage: "es" }), "spanish");
  assert.equal(resolveInterviewTemplateLocale({ language: "en" }), "english");
  assert.equal(
    resolveCanonicalInterviewMetaTemplateName(
      COMMUNICATION_ACTION_IDS.SEND_REMINDER,
      { preferredLanguage: "english" }
    ),
    "atlas_interview_reminder_en"
  );
  assert.equal(
    resolveInterviewWhatsAppRegistryKey(COMMUNICATION_ACTION_IDS.SEND_ZOOM),
    "zoom_invitation"
  );
});

test("opening interview WhatsApp action does not mutate ownership", () => {
  assert.equal(openingNativeInterviewWhatsAppActionChangesOwnership(), false);
});

test("MC and Workspace route native interview actions away from wa.me copy/open", () => {
  const dashboard = fs.readFileSync(path.join(root, "pages/Dashboard.jsx"), "utf8");
  assert.match(dashboard, /useNativeInterviewWhatsApp/);
  assert.match(dashboard, /mc-interview-whatsapp-composer/);
  assert.match(dashboard, /sendVia=/);
  assert.match(dashboard, /requiresHumanOwnership=/);
  assert.match(dashboard, /InterviewWhatsAppTemplateConfirm/);

  const customStart = dashboard.indexOf("{customWhatsAppComposerOpen");
  const customBlock = dashboard.slice(
    customStart,
    dashboard.indexOf("MissionControlExecutionPanel")
  );
  assert.doesNotMatch(customBlock, /sendVia=/);
  assert.doesNotMatch(customBlock, /requiresHumanOwnership=/);

  const workspaceActions = fs.readFileSync(
    path.join(root, "features/prospect-workspace/hooks/useWorkspaceActions.js"),
    "utf8"
  );
  assert.match(workspaceActions, /nativeInterviewWhatsApp/);

  const operational = fs.readFileSync(
    path.join(root, "features/prospect-workspace/components/OperationalWorkspace.jsx"),
    "utf8"
  );
  assert.match(operational, /workspace-interview-whatsapp-composer/);
  assert.match(operational, /sendVia=/);
  assert.match(operational, /requiresHumanOwnership=/);
  assert.match(operational, /InterviewWhatsAppTemplateConfirm/);

  const appointmentService = fs.readFileSync(
    path.join(root, "services/appointmentService.js"),
    "utf8"
  );
  assert.match(appointmentService, /deliveryMode === "automatic"/);
  assert.match(appointmentService, /whatsappNativeTemplateSent/);
  assert.match(appointmentService, /options\.message/);
  assert.match(appointmentService, /clientRequestId/);
});

test("commonCancel renders localized Cancel / Cancelar", () => {
  assert.equal(translations.en.commonCancel, "Cancel");
  assert.equal(translations.es.commonCancel, "Cancelar");

  const composer = fs.readFileSync(
    path.join(root, "components/communication/HumanWhatsAppComposer.jsx"),
    "utf8"
  );
  assert.match(composer, /translate\("commonCancel"\)/);
  assert.doesNotMatch(composer, /commonCancel"\) \|\|/);
});

test("office location remains outside native interview migration", () => {
  assert.equal(isNativeInterviewWhatsAppAction(COMMUNICATION_ACTION_IDS.SEND_OFFICE), false);
  const appointmentEngine = fs.readFileSync(
    path.join(root, "engines/appointmentCommunicationEngine.js"),
    "utf8"
  );
  assert.match(appointmentEngine, /SEND_OFFICE/);
});
