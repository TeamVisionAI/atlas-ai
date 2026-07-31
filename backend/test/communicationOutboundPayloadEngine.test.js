const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOutboundCommunicationPayload,
  payloadsMatchForSend,
  MISSING_KEYS
} = require("../core/communicationOutboundPayloadEngine");
const { composeWhatsAppMessage, WHATSAPP_TEMPLATES } = require("../core/whatsappCommunicationEngine");

const sampleBuilt = {
  template: WHATSAPP_TEMPLATES.INTERVIEW_DETAILS,
  message: composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language: "en",
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
    timezone: "America/New_York",
    zoomUrl: "https://zoom.us/j/123456789",
    interviewType: "zoom",
    organizationName: "Team Vision"
  }),
  language: "en",
  phone: "+15555550100",
  zoomUrl: "https://zoom.us/j/123456789",
  context: {
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
    timezone: "America/New_York",
    interviewType: "zoom",
    organizationName: "Team Vision",
    language: "en"
  }
};

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
      organizationName: "Team Vision",
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
  assert.equal(payload.location.zoomUrl, "https://zoom.us/j/123456789");
  assert.equal(payload.formatting.plainText, true);
});

test("buildOutboundCommunicationPayload flags missing zoom link for virtual interviews", () => {
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

  assert.ok(payload.missingContent.some((item) => item.key === MISSING_KEYS.ZOOM_LINK));
});

test("buildOutboundCommunicationPayload flags missing office location for in-person interviews", () => {
  const inPersonMessage = composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language: "es",
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
    timezone: "America/New_York",
    interviewType: "office",
    organizationName: "Team Vision"
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
        interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
        timezone: "America/New_York",
        interviewType: "office",
        organizationName: "Team Vision",
        language: "es"
      }
    },
    prospect: { name: "Maria Lopez", preferred_language: "spanish" }
  });

  assert.equal(payload.languageLabel, "Spanish");
  assert.ok(payload.missingContent.some((item) => item.key === MISSING_KEYS.OFFICE_LOCATION));
  assert.equal(payload.message, inPersonMessage);
});

test("payloadsMatchForSend compares preview and send payloads", () => {
  const preview = buildOutboundCommunicationPayload({ built: sampleBuilt, prospect: { name: "Maria Lopez" } });
  const send = buildOutboundCommunicationPayload({ built: sampleBuilt, prospect: { name: "Maria Lopez" } });

  assert.equal(payloadsMatchForSend(preview, send), true);
  assert.equal(
    payloadsMatchForSend(preview, { ...send, message: "different" }),
    false
  );
});
