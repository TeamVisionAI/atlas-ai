const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOutboundCommunicationPayload,
  payloadsMatchForSend,
  MISSING_KEYS
} = require("../core/communicationOutboundPayloadEngine");
const { composeWhatsAppMessage, WHATSAPP_TEMPLATES } = require("../core/whatsappCommunicationEngine");

const interviewAtMs = Date.parse("2026-03-15T18:30:00.000Z");
const timezone = "America/New_York";
const zoomUrl = "https://zoom.us/j/123456789";
const organizationName = "Team Vision Financial";

const sampleBuilt = {
  template: WHATSAPP_TEMPLATES.INTERVIEW_DETAILS,
  message: composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language: "en",
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs,
    timezone,
    zoomUrl,
    interviewType: "zoom",
    organizationName
  }),
  language: "en",
  phone: "+15555550100",
  zoomUrl,
  context: {
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs,
    timezone,
    interviewType: "zoom",
    organizationName,
    language: "en"
  }
};

function hasMissingKey(payload, key, severity = null) {
  return payload.missingContent.some(
    (item) => item.key === key && (severity ? item.severity === severity : true)
  );
}

test("buildOutboundCommunicationPayload uses exact composeWhatsAppMessage output", () => {
  const payload = buildOutboundCommunicationPayload({
    built: sampleBuilt,
    prospect: { name: "Maria Lopez", preferred_language: "english" },
    representative: {
      name: "Ana Rivera",
      email: "ana@example.com",
      repId: "4TJLK"
    },
    organizationSettings: {
      organizationName,
      office: {
        name: "Team Vision Office",
        fullAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
      }
    }
  });

  assert.equal(payload.message, sampleBuilt.message);
  assert.equal(payload.prospectName, "Maria Lopez");
  assert.equal(payload.representative.name, "Ana Rivera");
  assert.equal(payload.interview.type, "zoom");
  assert.equal(payload.interview.typeLabel, "Zoom Interview");
  assert.equal(payload.location.zoomUrl, zoomUrl);
  assert.equal(payload.formatting.plainText, true);
  assert.equal(payload.interview.schedule.timezoneAbbreviation, "EDT");
});

test("required validation blocks send for missing zoom link on virtual interviews", () => {
  const payload = buildOutboundCommunicationPayload({
    built: {
      ...sampleBuilt,
      message: "preview without link",
      zoomUrl: null,
      context: {
        ...sampleBuilt.context,
        interviewType: "zoom"
      }
    },
    prospect: { name: "Maria Lopez" }
  });

  assert.ok(hasMissingKey(payload, MISSING_KEYS.ZOOM_LINK, "error"));
  assert.ok(!hasMissingKey(payload, MISSING_KEYS.PROFILE_PHOTO, "error"));
});

test("required validation blocks send for missing representative name", () => {
  const payload = buildOutboundCommunicationPayload({
    built: {
      ...sampleBuilt,
      context: {
        ...sampleBuilt.context,
        recruiterName: null
      }
    },
    prospect: { name: "Maria Lopez" }
  });

  assert.ok(hasMissingKey(payload, MISSING_KEYS.REPRESENTATIVE_NAME, "error"));
});

test("required validation blocks send for missing prospect name", () => {
  const payload = buildOutboundCommunicationPayload({
    built: {
      ...sampleBuilt,
      context: {
        ...sampleBuilt.context,
        prospectName: null
      }
    },
    prospect: { name: null }
  });

  assert.ok(hasMissingKey(payload, MISSING_KEYS.PROSPECT_NAME, "error"));
});

test("representative name resolves from recruiter context without false missing flag", () => {
  const payload = buildOutboundCommunicationPayload({
    built: sampleBuilt,
    prospect: { name: "Maria Lopez" },
    representative: null
  });

  assert.equal(payload.representative.name, "Ana Rivera");
  assert.ok(!hasMissingKey(payload, MISSING_KEYS.REPRESENTATIVE_NAME, "error"));
});

test("recommended validation does not block send for missing branding", () => {
  const payload = buildOutboundCommunicationPayload({
    built: sampleBuilt,
    prospect: { name: "Maria Lopez" },
    representative: { name: "Ana Rivera" }
  });

  assert.ok(hasMissingKey(payload, MISSING_KEYS.PROFILE_PHOTO, "recommended"));
  assert.ok(hasMissingKey(payload, MISSING_KEYS.OFFICE_LOGO, "recommended"));
  assert.ok(hasMissingKey(payload, MISSING_KEYS.REPRESENTATIVE_TITLE, "recommended"));
  assert.ok(!hasMissingKey(payload, MISSING_KEYS.PROFILE_PHOTO, "error"));
});

test("office interview requires office address but not zoom link", () => {
  const inPersonMessage = composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language: "es",
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs,
    timezone,
    interviewType: "office",
    organizationName
  });

  const payload = buildOutboundCommunicationPayload({
    built: {
      template: WHATSAPP_TEMPLATES.INTERVIEW_DETAILS,
      message: inPersonMessage,
      language: "es",
      phone: "+15555550100",
      context: {
        prospectName: "Maria Lopez",
        recruiterName: "Ana Rivera",
        interviewAtMs,
        timezone,
        interviewType: "office",
        organizationName,
        language: "es"
      }
    },
    prospect: { name: "Maria Lopez", preferred_language: "spanish" },
    representative: { name: "Ana Rivera" }
  });

  assert.equal(payload.languageLabel, "Spanish");
  assert.equal(payload.interview.typeLabel, "Entrevista presencial");
  assert.ok(hasMissingKey(payload, MISSING_KEYS.OFFICE_LOCATION, "error"));
  assert.ok(!hasMissingKey(payload, MISSING_KEYS.ZOOM_LINK, "error"));
  assert.equal(payload.message, inPersonMessage);
});

test("payloadsMatchForSend compares preview and send payloads", () => {
  const preview = buildOutboundCommunicationPayload({ built: sampleBuilt, prospect: { name: "Maria Lopez" } });
  const send = buildOutboundCommunicationPayload({ built: sampleBuilt, prospect: { name: "Maria Lopez" } });

  assert.equal(payloadsMatchForSend(preview, send), true);
  assert.equal(preview.message, send.message);
  assert.equal(
    payloadsMatchForSend(preview, { ...send, message: "different" }),
    false
  );
});
