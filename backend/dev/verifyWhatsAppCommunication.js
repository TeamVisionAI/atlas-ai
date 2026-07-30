/**
 * Verify WhatsApp communication engine — message composition and template resolution.
 */

const assert = require("assert");
const {
  WHATSAPP_TEMPLATES,
  resolveTemplateForAction,
  composeWhatsAppMessage,
  buildZoomInvitationMessage
} = require("../core/whatsappCommunicationEngine");

function run() {
  assert.equal(
    resolveTemplateForAction("send_zoom_link", {}),
    WHATSAPP_TEMPLATES.ZOOM_INVITATION
  );

  assert.equal(
    resolveTemplateForAction("whatsapp"),
    WHATSAPP_TEMPLATES.GENERAL
  );

  assert.equal(
    resolveTemplateForAction("send_interview_reminder"),
    WHATSAPP_TEMPLATES.INTERVIEW_REMINDER
  );

  const message = buildZoomInvitationMessage({
    prospectName: "Maria Lopez",
    interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
    timezone: "America/New_York",
    recruiterName: "Ana Rivera",
    zoomUrl: "https://zoom.us/j/123456789",
    language: "en"
  });

  assert.ok(message.includes("Hi Maria,"));
  assert.ok(message.includes("Date:"));
  assert.ok(message.includes("Time:"));
  assert.ok(message.includes("Time Zone:"));
  assert.ok(message.includes("Recruiter: Ana Rivera"));
  assert.ok(message.includes("https://zoom.us/j/123456789"));
  assert.ok(message.includes("We look forward to speaking with you!"));

  const officeMessage = composeWhatsAppMessage(WHATSAPP_TEMPLATES.OFFICE_LOCATION, {
    language: "en",
    office: {
      name: "Team Vision Office",
      fullAddress: "2500 NW 79th Ave, Miami, Florida"
    }
  });

  assert.ok(officeMessage.includes("Team Vision Office"));
  assert.ok(officeMessage.includes("2500 NW 79th Ave"));

  console.log("verifyWhatsAppCommunication: all checks passed");
}

run();
