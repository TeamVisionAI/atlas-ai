/**
 * BR-093 — Interview confirmation/details BODY {{4}} meeting-details semantics.
 * Zoom → language-specific “link provided separately” (never URL, never duplicate type).
 * In-person → BR-077 canonical address. No live WhatsApp. Templates remain inactive.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInterviewConfirmationVariables,
  buildZoomInvitationVariables,
  ZOOM_MEETING_DETAILS_COPY,
  normalizeZoomDynamicUrlButtonParameter
} = require("../core/whatsappTemplateVariableBuilder");
const {
  CANONICAL_META_TEMPLATE_NAMES,
  getCanonicalMetaTemplateName,
  getApprovedTemplateRegistry,
  resolveApprovedTemplate,
  isStaleMetaTemplateName
} = require("../core/whatsappApprovedTemplateRegistry");
const { authorizeWhatsAppOutbound } = require("../core/whatsappOutboundAuthorizationGate");
const { evaluateCustomerCareWindowFromInboundAt } = require("../core/whatsappCustomerCareWindow");
const { isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { isCompleteOfficeAddress } = require("../core/officeAddressResolver");

const NOW = Date.parse("2026-08-07T18:00:00.000Z");
const CLOSED_WINDOW = async () =>
  evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: "2026-08-01T10:00:00.000Z",
    now: NOW
  });

const FULL_OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const ZOOM_URL = "https://zoom.us/j/1234567890";

function zoomAppt(extra = {}) {
  return {
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: ZOOM_URL,
    startDateTime: "2026-08-10T15:00:00.000Z",
    timezone: "America/New_York",
    ...extra
  };
}

function officeAppt(extra = {}) {
  return {
    meetingType: "in_person",
    meetingLocationType: "office",
    meetingAddress: FULL_OFFICE,
    startDateTime: "2026-08-10T15:00:00.000Z",
    timezone: "America/New_York",
    ...extra
  };
}

test("1. confirmation EN Zoom: {{3}}=Zoom, {{4}}=link provided separately", () => {
  const vars = buildInterviewConfirmationVariables(zoomAppt(), {
    name: "Maria Lopez",
    preferred_language: "english"
  });
  assert.equal(vars.meeting_type, "Zoom");
  assert.equal(vars.meeting_location, "Your Zoom link will be provided separately");
  assert.equal(vars.meeting_location, ZOOM_MEETING_DETAILS_COPY.en);
});

test("2. confirmation ES Zoom: {{3}}=Zoom, {{4}}=enlace por separado", () => {
  const vars = buildInterviewConfirmationVariables(zoomAppt(), {
    name: "Maria Lopez",
    preferred_language: "spanish"
  });
  assert.equal(vars.meeting_type, "Zoom");
  assert.equal(vars.meeting_location, "Tu enlace de Zoom será enviado por separado");
  assert.equal(vars.meeting_location, ZOOM_MEETING_DETAILS_COPY.es);
});

test("3. no duplicate Zoom / Zoom values", () => {
  const en = buildInterviewConfirmationVariables(zoomAppt(), {
    name: "Ana",
    preferred_language: "english"
  });
  const es = buildInterviewConfirmationVariables(zoomAppt(), {
    name: "Ana",
    preferred_language: "spanish"
  });
  assert.notEqual(en.meeting_type, en.meeting_location);
  assert.notEqual(es.meeting_type, es.meeting_location);
  assert.notEqual(en.meeting_location, "Zoom");
  assert.notEqual(es.meeting_location, "Zoom");
});

test("4. Zoom URL is NOT inserted into confirmation {{4}}", () => {
  const vars = buildInterviewConfirmationVariables(
    zoomAppt({ virtualMeetingUrl: ZOOM_URL, meetingAddress: FULL_OFFICE }),
    { name: "Ana", preferred_language: "english" }
  );
  assert.equal(vars.meeting_location.includes("zoom.us"), false);
  assert.equal(vars.meeting_location.includes("1234567890"), false);
  assert.equal(vars.meeting_location.includes("j/"), false);
  assert.equal(vars.meeting_location.includes(FULL_OFFICE), false);
});

test("5. in-person EN uses canonical address/details", () => {
  const vars = buildInterviewConfirmationVariables(officeAppt(), {
    name: "Ana",
    preferred_language: "english"
  });
  assert.equal(vars.meeting_type, "In person");
  assert.equal(vars.meeting_location, FULL_OFFICE);
  assert.equal(isCompleteOfficeAddress(vars.meeting_location), true);
});

test("6. in-person ES uses canonical address/details", () => {
  const vars = buildInterviewConfirmationVariables(officeAppt(), {
    name: "Ana",
    preferred_language: "spanish"
  });
  assert.equal(vars.meeting_type, "En persona");
  assert.equal(vars.meeting_location, FULL_OFFICE);
});

test("7. BR-077 office address preserved (suite/zip)", () => {
  const vars = buildInterviewConfirmationVariables(officeAppt(), {
    name: "Ana",
    preferred_language: "english"
  });
  assert.match(vars.meeting_location, /Suite 189/);
  assert.match(vars.meeting_location, /33122/);
  assert.match(vars.meeting_location, /Doral/);
});

test("8-9. BR-092 Zoom invitation unchanged — button meeting ID only", () => {
  const zoom = buildZoomInvitationVariables({ name: "Maria" }, ZOOM_URL);
  assert.equal(zoom.ok, true);
  assert.equal(zoom.variables.prospect_first_name, "Maria");
  assert.equal(zoom.buttonVariables.meeting_url, "1234567890");
  assert.equal(
    normalizeZoomDynamicUrlButtonParameter("https://zoom.us/j/1234567890").parameter,
    "1234567890"
  );
  assert.equal(normalizeZoomDynamicUrlButtonParameter("j/1234567890").parameter, "1234567890");
});

test("10-11. missed ES v2 + BR-078 mappings unchanged", () => {
  assert.equal(
    getCanonicalMetaTemplateName("missed_appointment", "spanish"),
    "atlas_missed_appointment_es_v2"
  );
  assert.equal(isStaleMetaTemplateName("atlas_missed_appointment_es"), true);
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_confirmation.english,
    "atlas_interview_confirmation_en"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.interview_confirmation.spanish,
    "atlas_interview_confirmation_es"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.zoom_invitation.english,
    "atlas_zoom_invitation_en"
  );
});

test("12. BR-075 authorization unchanged — inactive templates block outside window", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_CONFIRMATION",
    templateKey: "interview_confirmation",
    phone: "+17865550188",
    prospect: { preferred_language: "english", name: "Ana" },
    templateVariables: {
      prospect_first_name: "Ana",
      interview_when: "Monday",
      meeting_type: "Zoom",
      meeting_location: ZOOM_MEETING_DETAILS_COPY.en
    },
    now: NOW,
    evaluateWindow: CLOSED_WINDOW
  });
  assert.equal(auth.authorized, false);
});

test("13. missing required meeting details fails closed", () => {
  const incomplete = buildInterviewConfirmationVariables(
    {
      meetingType: "in_person",
      meetingAddress: "Doral, FL",
      startDateTime: "2026-08-10T15:00:00.000Z",
      timezone: "America/New_York"
    },
    { name: "Ana", preferred_language: "english" }
  );
  assert.equal(incomplete.meeting_location, null);

  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      interview_confirmation: {
        english: {
          metaTemplateName: "atlas_interview_confirmation_en",
          approved: true,
          active: true
        }
      }
    })
  );
  const resolved = resolveApprovedTemplate({
    templateKey: "interview_confirmation",
    prospect: { preferred_language: "english" },
    variables: incomplete,
    registry
  });
  assert.equal(resolved.ok, false);
  assert.ok(
    (resolved.missingVariables || []).includes("meeting_location") ||
      resolved.reason === "TEMPLATE_VARIABLES_INVALID"
  );
});

test("14-17. no live send; templates inactive; no Railway packet; Recruit AI OFF", () => {
  assert.equal(process.env.WHATSAPP_APPROVED_TEMPLATES_JSON || "", "");
  assert.equal(isExecutionEnabled(), false);
  const inactive = resolveApprovedTemplate({
    templateKey: "interview_confirmation",
    prospect: { preferred_language: "english" },
    variables: {
      prospect_first_name: "Ana",
      interview_when: "Monday",
      meeting_type: "Zoom",
      meeting_location: ZOOM_MEETING_DETAILS_COPY.en
    }
  });
  assert.equal(inactive.ok, false);
});

test("18. confirmation EN Zoom authorizes with active registry + BR-093 vars", () => {
  const vars = buildInterviewConfirmationVariables(zoomAppt(), {
    name: "Maria",
    preferred_language: "english"
  });
  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      interview_confirmation: {
        english: {
          metaTemplateName: "atlas_interview_confirmation_en",
          approved: true,
          active: true
        }
      }
    })
  );
  const resolved = resolveApprovedTemplate({
    templateKey: "interview_confirmation",
    prospect: { preferred_language: "english" },
    variables: vars,
    registry
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.variables.meeting_type, "Zoom");
  assert.equal(
    resolved.variables.meeting_location,
    "Your Zoom link will be provided separately"
  );
});
