/**
 * BR-078 — WhatsApp approved template catalog contracts + call-site wiring.
 * All provider calls mocked. No live WhatsApp. No Meta submission. No Railway activation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  BASE_REGISTRY,
  INTENT_TO_KEY,
  getApprovedTemplateRegistry,
  getTemplateRegistryHealth,
  listRegistryKeys,
  resolveApprovedTemplate,
  resolveRegistryKeyForIntent,
  resolveTemplateLanguage
} = require("../core/whatsappApprovedTemplateRegistry");
const {
  authorizeWhatsAppOutbound,
  DELIVERY_STATUSES
} = require("../core/whatsappOutboundAuthorizationGate");
const { evaluateCustomerCareWindowFromInboundAt } = require("../core/whatsappCustomerCareWindow");
const {
  buildInterviewReminderVariables,
  buildInterviewConfirmationVariables,
  buildOfficeLocationVariables,
  buildZoomInvitationVariables,
  localizeMeetingType,
  isProspectOptedOut
} = require("../core/whatsappTemplateVariableBuilder");
const { buildTemplateComponents } = require("../core/whatsappOutboundPipeline");

const NOW = Date.parse("2026-08-06T18:00:00.000Z");
const CLOSED_WINDOW = async () =>
  evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: "2026-08-01T10:00:00.000Z",
    now: NOW
  });

const FULL_OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const PUBLIC_ADDR = "100 Biscayne Blvd, Miami, FL 33132";
const ZOOM_URL = "https://us02web.zoom.us/j/555111222";

function activeRegistry(key, locale = "english", name = `tv_${key}_en`) {
  return getApprovedTemplateRegistry(
    JSON.stringify({
      [key]: {
        [locale]: {
          metaTemplateName: name,
          approved: true,
          active: true
        }
      }
    })
  );
}

const CANONICAL_KEYS = [
  "lead_welcome",
  "interview_confirmation",
  "interview_reminder",
  "interview_details",
  "missed_appointment",
  "zoom_invitation",
  "office_location",
  "human_assist_notice",
  "follow_up"
];

test("1. every canonical registry key exists", () => {
  const keys = listRegistryKeys();
  for (const key of CANONICAL_KEYS) {
    assert.ok(keys.includes(key), `missing ${key}`);
    assert.ok(BASE_REGISTRY[key], `BASE_REGISTRY missing ${key}`);
  }
});

test("2-3. exact intent mapping; CONFIRMATION no longer maps to reminder", () => {
  assert.equal(INTENT_TO_KEY.APPOINTMENT_CONFIRMATION, "interview_confirmation");
  assert.equal(INTENT_TO_KEY.SCHEDULE_CONFIRMATION, "interview_confirmation");
  assert.equal(INTENT_TO_KEY.APPOINTMENT_REMINDER, "interview_reminder");
  assert.equal(INTENT_TO_KEY.REMINDER_24H, "interview_reminder");
  assert.equal(INTENT_TO_KEY.REMINDER_1H, "interview_reminder");
  assert.equal(INTENT_TO_KEY.REMINDER_15M, "interview_reminder");
  assert.equal(INTENT_TO_KEY.INTERVIEW_DETAILS, "interview_details");
  assert.equal(INTENT_TO_KEY.RESCHEDULE_CONFIRMATION, "interview_details");
  assert.equal(INTENT_TO_KEY.SEND_ZOOM_LINK, "zoom_invitation");
  assert.equal(INTENT_TO_KEY.ZOOM_INVITATION, "zoom_invitation");
  assert.equal(INTENT_TO_KEY.SEND_OFFICE_LOCATION, "office_location");
  assert.equal(INTENT_TO_KEY.OFFICE_LOCATION, "office_location");
  assert.equal(INTENT_TO_KEY.MISSED_APPOINTMENT, "missed_appointment");
  assert.equal(INTENT_TO_KEY.send_missed_appointment, "missed_appointment");
  assert.equal(INTENT_TO_KEY.AGENT_MISSED_APPOINTMENT, "missed_appointment");
  assert.equal(INTENT_TO_KEY.HUMAN_ASSIST, "human_assist_notice");
  assert.equal(INTENT_TO_KEY.HANDOFF, "human_assist_notice");
  assert.equal(INTENT_TO_KEY.HUMAN_ASSIST_NOTICE, "human_assist_notice");
  assert.equal(INTENT_TO_KEY.FACEBOOK_LEAD_WELCOME, "lead_welcome");
  assert.equal(INTENT_TO_KEY.LEAD_WELCOME, "lead_welcome");
  assert.equal(INTENT_TO_KEY.CONFIRMATION, undefined);
  assert.equal(
    resolveRegistryKeyForIntent("CONFIRMATION").code,
    "AMBIGUOUS_CONFIRMATION_INTENT"
  );
});

test("4-8. locale resolution and fail-closed language rules", () => {
  assert.equal(resolveTemplateLanguage({ preferred_language: "english" }), "english");
  assert.equal(resolveTemplateLanguage({ preferred_language: "spanish" }), "spanish");
  assert.equal(
    resolveTemplateLanguage({ preferred_language: "spanish", language: "en" }),
    "spanish"
  );

  const registry = activeRegistry("interview_reminder", "spanish", "tv_reminder_es");
  const spanishOk = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "spanish" },
    variables: {
      prospect_first_name: "Ana",
      interview_when: "viernes",
      meeting_type: "Zoom"
    },
    registry
  });
  assert.equal(spanishOk.ok, true);
  assert.equal(spanishOk.language, "spanish");

  const noFallback = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: {
      prospect_first_name: "Ana",
      interview_when: "Friday",
      meeting_type: "Zoom"
    },
    registry
  });
  assert.equal(noFallback.ok, false);
});

test("9-11. inactive / unapproved / approved+active without Meta name blocked", () => {
  assert.equal(
    resolveApprovedTemplate({
      templateKey: "interview_reminder",
      prospect: { preferred_language: "english" },
      variables: {
        prospect_first_name: "A",
        interview_when: "B",
        meeting_type: "Zoom"
      }
    }).ok,
    false
  );

  const noName = getApprovedTemplateRegistry(
    JSON.stringify({
      interview_reminder: {
        english: { metaTemplateName: null, approved: true, active: true }
      }
    })
  );
  const blocked = resolveApprovedTemplate({
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: {
      prospect_first_name: "A",
      interview_when: "B",
      meeting_type: "Zoom"
    },
    registry: noName
  });
  assert.equal(blocked.ok, false);
});

test("12. invalid JSON disables template sending safely", () => {
  const registry = getApprovedTemplateRegistry("{not-json");
  const health = getTemplateRegistryHealth(registry);
  assert.equal(health.ok, false);
  assert.equal(health.blocker, false);
  assert.equal(health.diagnostics.parseError, true);

  const resolved = resolveApprovedTemplate({
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: {
      prospect_first_name: "A",
      interview_when: "B",
      meeting_type: "Zoom"
    },
    registry
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, "TEMPLATE_REGISTRY_CONFIG_INVALID");
});

test("13-15. wrong body/button parameter count or order blocked", () => {
  const registry = activeRegistry("interview_reminder");
  const wrongOrder = resolveApprovedTemplate({
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: {
      meeting_type: "Zoom",
      prospect_first_name: "A",
      interview_when: "B"
    },
    registry
  });
  assert.equal(wrongOrder.ok, false);
  assert.equal(wrongOrder.reason, "TEMPLATE_VARIABLE_ORDER_INVALID");

  const zoomRegistry = activeRegistry("zoom_invitation", "english", "tv_zoom_en");
  const missingButton = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "A" },
    buttonVariables: {},
    registry: zoomRegistry
  });
  assert.equal(missingButton.ok, false);
});

test("16-17. lead_welcome marketing; follow_up remains non-sendable", () => {
  assert.equal(BASE_REGISTRY.lead_welcome.category, "marketing");
  assert.equal(BASE_REGISTRY.follow_up.sendable, false);
  assert.equal(BASE_REGISTRY.follow_up.category, "pending_classification");

  const followRegistry = getApprovedTemplateRegistry(
    JSON.stringify({
      follow_up: {
        english: {
          metaTemplateName: "tv_follow_up_en",
          approved: true,
          active: true
        }
      }
    })
  );
  const follow = resolveApprovedTemplate({
    templateKey: "follow_up",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "A" },
    registry: followRegistry
  });
  assert.equal(follow.ok, false);
  assert.equal(follow.reason, "UNSUPPORTED_OR_PENDING_CATEGORY");
});

test("18-24. call-site source contracts for template keys", () => {
  const hub = fs.readFileSync(
    path.join(__dirname, "../core/communicationHub.js"),
    "utf8"
  );
  const reminder = fs.readFileSync(
    path.join(__dirname, "../services/appointmentReminderEngine.js"),
    "utf8"
  );
  const agent = fs.readFileSync(
    path.join(__dirname, "../application/agentActionApplicationService.js"),
    "utf8"
  );
  const lead = fs.readFileSync(
    path.join(__dirname, "../core/recruitingWorkflowOrchestrator.js"),
    "utf8"
  );

  assert.match(hub, /interview_confirmation/);
  assert.match(reminder, /interview_reminder/);
  assert.match(reminder, /buildInterviewReminderVariables/);
  assert.match(agent, /zoom_invitation/);
  assert.match(agent, /office_location/);
  assert.match(agent, /missed_appointment/);
  assert.match(lead, /lead_welcome/);
  assert.match(hub, /interview_details/);
});

test("25-26. Spanish interview_when + localized meeting_type; no internal enums", () => {
  const appointment = {
    startDateTime: "2026-08-10T15:00:00.000Z",
    timezone: "America/New_York",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: ZOOM_URL
  };
  const spanish = buildInterviewReminderVariables(appointment, {
    name: "Maria Lopez",
    preferred_language: "spanish"
  });
  assert.equal(spanish.meeting_type, "Zoom");
  assert.match(spanish.interview_when, /[a-záéíóúñ]/i);
  assert.equal(spanish.interview_when.includes("virtual"), false);
  assert.equal(Object.keys(spanish).join(","), "prospect_first_name,interview_when,meeting_type");

  assert.equal(
    localizeMeetingType({ meetingType: "in_person" }, { preferred_language: "spanish" }),
    "En persona"
  );
  assert.equal(
    localizeMeetingType(
      { meetingLocationType: "public_location" },
      { preferred_language: "english" }
    ),
    "Public location"
  );
});

test("27-31. Suite 189 / public / zoom location and URL fail-closed", () => {
  const officeAppt = {
    meetingType: "in_person",
    meetingAddress: FULL_OFFICE,
    startDateTime: "2026-08-10T15:00:00.000Z",
    timezone: "America/New_York"
  };
  const conf = buildInterviewConfirmationVariables(officeAppt, {
    name: "Ana",
    preferred_language: "english"
  });
  assert.match(conf.meeting_location, /Suite 189/);
  assert.match(conf.meeting_location, /33122/);

  const publicAppt = {
    meetingType: "in_person",
    meetingLocationType: "public_location",
    meetingAddress: PUBLIC_ADDR,
    startDateTime: "2026-08-10T15:00:00.000Z",
    timezone: "America/New_York"
  };
  const publicVars = buildOfficeLocationVariables(publicAppt, { name: "Ana" });
  assert.equal(publicVars.ok, true);
  assert.equal(publicVars.variables.meeting_address, PUBLIC_ADDR);
  assert.equal(publicVars.variables.meeting_address.includes("79th"), false);

  const zoomConf = buildInterviewConfirmationVariables(
    {
      meetingType: "virtual",
      meetingProvider: "zoom",
      virtualMeetingUrl: ZOOM_URL,
      meetingAddress: FULL_OFFICE,
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { name: "Ana", preferred_language: "english" }
  );
  assert.equal(zoomConf.meeting_location, "Zoom");
  assert.equal(zoomConf.meeting_location.includes("79th"), false);

  assert.equal(buildZoomInvitationVariables({ name: "Ana" }, null).ok, false);
  assert.equal(buildOfficeLocationVariables({ meetingAddress: "Doral, FL" }, { name: "A" }).ok, false);
});

test("32-34. opt-out and cross-org blocks", async () => {
  assert.equal(isProspectOptedOut({ do_not_contact: true }), true);

  const opted = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_REMINDER",
    phone: "+17865550100",
    message: "x",
    prospect: { preferred_language: "english", do_not_contact: true },
    templateKey: "interview_reminder",
    templateVariables: {
      prospect_first_name: "A",
      interview_when: "B",
      meeting_type: "Zoom"
    },
    now: NOW,
    evaluateWindow: CLOSED_WINDOW
  });
  assert.equal(opted.authorized, false);
  assert.equal(opted.reason, "PROSPECT_OPTED_OUT");

  const cross = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_REMINDER",
    phone: "+17865550100",
    organizationId: "org-a",
    message: "x",
    prospect: {
      preferred_language: "english",
      organization_id: "org-b"
    },
    templateKey: "interview_reminder",
    templateVariables: {
      prospect_first_name: "A",
      interview_when: "B",
      meeting_type: "Zoom"
    },
    now: NOW,
    evaluateWindow: CLOSED_WINDOW
  });
  assert.equal(cross.reason, "CROSS_ORGANIZATION_REJECTED");
});

test("35-36. blocked send does not look successful; mocked template auth updates delivery shape", async () => {
  const registry = activeRegistry("missed_appointment", "english", "tv_missed_en");
  const auth = await authorizeWhatsAppOutbound({
    intent: "MISSED_APPOINTMENT",
    phone: "+17865550100",
    message: "freeform missed",
    prospect: { preferred_language: "english", name: "Ana" },
    templateKey: "missed_appointment",
    templateVariables: { prospect_first_name: "Ana" },
    now: NOW,
    evaluateWindow: CLOSED_WINDOW,
    resolveTemplate: (input) => resolveApprovedTemplate({ ...input, registry })
  });
  assert.equal(auth.status, "authorized_template");
  assert.equal(auth.templateKey, "missed_appointment");
  assert.equal(auth.authorized, true);

  const blocked = await authorizeWhatsAppOutbound({
    intent: "MISSED_APPOINTMENT",
    phone: "+17865550100",
    message: "freeform missed",
    prospect: { preferred_language: "english", name: "Ana" },
    templateKey: "missed_appointment",
    templateVariables: { prospect_first_name: "Ana" },
    now: NOW,
    evaluateWindow: CLOSED_WINDOW
  });
  assert.equal(blocked.authorized, false);
  assert.notEqual(blocked.status, DELIVERY_STATUSES.SENT_TEMPLATE);
});

test("37-38. Meta Review untouched; audit components sanitized", () => {
  const metaReview = fs.readFileSync(
    path.join(__dirname, "../test/scheduleConversationalFlexibilityMetaReviewBoundary.test.js"),
    "utf8"
  );
  assert.match(metaReview, /Meta Review/);

  const components = buildTemplateComponents(
    ["prospect_first_name"],
    { prospect_first_name: "Ana" },
    ["meeting_url"],
    { meeting_url: ZOOM_URL }
  );
  assert.equal(components[0].type, "body");
  assert.equal(components[1].type, "button");
  assert.equal(components[1].sub_type, "url");
  const blob = JSON.stringify(components);
  assert.equal(blob.includes("ACCESS_TOKEN"), false);
  assert.equal(blob.includes("Bearer"), false);
});

test("39. unknown env keys rejected without crashing registry", () => {
  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      totally_unknown_key: {
        english: { metaTemplateName: "x", approved: true, active: true }
      }
    })
  );
  assert.ok(registry.__diagnostics.unknownKeys.includes("totally_unknown_key"));
  assert.equal(registry.totally_unknown_key, undefined);
});

test("40. Zoom invitation authorizes with body + button variables", () => {
  const registry = activeRegistry("zoom_invitation", "english", "tv_zoom_en");
  const zoomVars = buildZoomInvitationVariables({ name: "Ana" }, ZOOM_URL);
  const resolved = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "english" },
    variables: zoomVars.variables,
    buttonVariables: zoomVars.buttonVariables,
    registry
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.expectedButtonVariableKeys[0], "meeting_url");
});

test("41. source contracts: CONFIRMATION removed from reminder intents", () => {
  assert.equal(BASE_REGISTRY.interview_reminder.intents.includes("CONFIRMATION"), false);
  assert.equal(
    BASE_REGISTRY.interview_confirmation.intents.includes("APPOINTMENT_CONFIRMATION"),
    true
  );
});
