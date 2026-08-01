require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WHATSAPP_TEMPLATES,
  resolveInterviewDetailsTemplate,
  resolveInterviewReminderTemplate,
  resolveInterviewTypeFromAppointment,
  buildInterviewDetailsMessage,
  buildInterviewReminderMessage,
  composeWhatsAppMessage,
  resolveOrganizationName
} = require("../core/whatsappCommunicationEngine");
const {
  buildOutboundCommunicationPayload,
  payloadsMatchForSend
} = require("../core/communicationOutboundPayloadEngine");
const { buildRepresentativeProfileFromUser, resolveAssignedRepresentative } = require("../core/representativeProfileEngine");

const interviewAtMs = Date.parse("2026-03-15T18:30:00.000Z");
const timezone = "America/New_York";
const zoomUrl = "https://zoom.us/j/123456789";
const organizationName = "Team Vision Financial";

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

test("resolveInterviewReminderTemplate returns interview_reminder template", () => {
  assert.equal(resolveInterviewReminderTemplate(), WHATSAPP_TEMPLATES.INTERVIEW_REMINDER);
});

test("buildInterviewReminderMessage English zoom reminder includes representative once", () => {
  const message = buildInterviewReminderMessage({
    prospectName: "Sarah Chen",
    interviewAtMs,
    timezone,
    recruiterName: "Ana Rivera",
    zoomUrl,
    interviewType: "zoom",
    organizationName,
    language: "en"
  });

  assert.ok(message.includes("Hello Sarah,"));
  assert.ok(message.includes("This is a reminder that your interview is scheduled for:"));
  assert.ok(message.includes("📅 Date:"));
  assert.ok(message.includes("🕔 Time:"));
  assert.ok(message.includes(zoomUrl));
  assert.ok(message.includes("🔗 Join here:"));
  assert.ok(message.includes("Ana Rivera"));
  assert.equal(countOccurrences(message, organizationName), 1);
  assert.ok(!message.includes(`reminder about your upcoming ${organizationName}`));
});

test("buildInterviewReminderMessage Spanish zoom reminder includes representative once", () => {
  const message = buildInterviewReminderMessage({
    prospectName: "Sarah Chen",
    interviewAtMs,
    timezone,
    recruiterName: "Ana Rivera",
    zoomUrl,
    interviewType: "zoom",
    organizationName,
    language: "es"
  });

  assert.ok(message.includes("Hola Sarah,"));
  assert.ok(message.includes("Te recuerdo que tu entrevista está programada para:"));
  assert.ok(message.includes("📅 Fecha:"));
  assert.ok(message.includes("🕔 Hora:"));
  assert.ok(message.includes(zoomUrl));
  assert.ok(message.includes("🔗 Únete aquí:"));
  assert.ok(message.includes("Ana Rivera"));
  assert.equal(countOccurrences(message, organizationName), 1);
  assert.ok(!message.includes(`entrevista con ${organizationName}`));
});

test("buildInterviewReminderMessage office reminder includes address and no zoom link", () => {
  const message = buildInterviewReminderMessage({
    prospectName: "Sarah Chen",
    interviewAtMs,
    timezone,
    recruiterName: "Ana Rivera",
    interviewType: "office",
    office: {
      name: "Team Vision Office",
      fullAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    },
    organizationName,
    language: "en"
  });

  assert.ok(message.includes("Ana Rivera"));
  assert.ok(message.includes("2500 NW 79th Ave"));
  assert.ok(!message.includes("zoom.us"));
  assert.ok(!message.includes("🔗 Join here:"));
  assert.equal(countOccurrences(message, organizationName), 1);
});

test("buildInterviewReminderMessage blocks send when representative name missing in payload", () => {
  const built = {
    template: WHATSAPP_TEMPLATES.INTERVIEW_REMINDER,
    message: buildInterviewReminderMessage({
      prospectName: "Sarah Chen",
      interviewAtMs,
      timezone,
      recruiterName: "",
      zoomUrl,
      interviewType: "zoom",
      organizationName,
      language: "en"
    }),
    language: "en",
    phone: "+15555550100",
    zoomUrl,
    context: {
      prospectName: "Sarah Chen",
      recruiterName: null,
      interviewAtMs,
      timezone,
      interviewType: "zoom",
      organizationName
    }
  };

  const payload = buildOutboundCommunicationPayload({
    built,
    prospect: { name: "Sarah Chen", phone: "+15555550100" },
    representative: null,
    appointment: { id: "appt-123" },
    organizationSettings: { organizationName, office: { fullAddress: "123 Main" } }
  });

  const requiredMissing = payload.missingContent.filter((item) => item.category === "required");
  assert.ok(requiredMissing.some((item) => item.key === "representativeName"));
});

test("buildInterviewReminderMessage preview and send payloads match", () => {
  const built = {
    template: WHATSAPP_TEMPLATES.INTERVIEW_REMINDER,
    message: buildInterviewReminderMessage({
      prospectName: "Sarah Chen",
      interviewAtMs,
      timezone,
      recruiterName: "Ana Rivera",
      zoomUrl,
      interviewType: "zoom",
      organizationName,
      language: "en"
    }),
    language: "en",
    phone: "+15555550100",
    zoomUrl,
    context: {
      prospectName: "Sarah Chen",
      recruiterName: "Ana Rivera",
      interviewAtMs,
      timezone,
      interviewType: "zoom",
      organizationName
    }
  };

  const previewPayload = buildOutboundCommunicationPayload({
    built,
    prospect: { name: "Sarah Chen", phone: "+15555550100" },
    representative: { name: "Ana Rivera", title: "Recruiting Manager" },
    appointment: { id: "appt-123" },
    organizationSettings: { organizationName }
  });

  const sendPayload = buildOutboundCommunicationPayload({
    built,
    prospect: { name: "Sarah Chen", phone: "+15555550100" },
    representative: { name: "Ana Rivera", title: "Recruiting Manager" },
    appointment: { id: "appt-123" },
    organizationSettings: { organizationName }
  });

  assert.equal(payloadsMatchForSend(previewPayload, sendPayload), true);
});

test("resolveInterviewDetailsTemplate returns interview_details template", () => {
  assert.equal(
    resolveInterviewDetailsTemplate({ meetingType: "virtual" }),
    WHATSAPP_TEMPLATES.INTERVIEW_DETAILS
  );
  assert.equal(
    resolveInterviewDetailsTemplate({ meetingType: "in_person" }),
    WHATSAPP_TEMPLATES.INTERVIEW_DETAILS
  );
});

test("resolveInterviewTypeFromAppointment maps meeting types", () => {
  assert.equal(resolveInterviewTypeFromAppointment({ meetingType: "virtual" }), "zoom");
  assert.equal(resolveInterviewTypeFromAppointment({ meetingType: "in_person" }), "office");
  assert.equal(
    resolveInterviewTypeFromAppointment(null, { interview_type: "Zoom Interview" }),
    "zoom"
  );
});

test("buildInterviewDetailsMessage English zoom invitation mentions organization once", () => {
  const message = buildInterviewDetailsMessage({
    prospectName: "Maria Lopez",
    interviewAtMs,
    timezone,
    recruiterName: "Ana Rivera",
    zoomUrl,
    interviewType: "zoom",
    organizationName,
    language: "en"
  });

  assert.ok(message.includes("Hello Maria,"));
  assert.ok(message.includes("Your interview is confirmed!"));
  assert.ok(message.includes("👤 Interviewer:"));
  assert.ok(message.includes("Ana Rivera"));
  assert.ok(message.includes("📅 Date:"));
  assert.ok(message.includes("🕚 Time:"));
  assert.ok(message.includes(zoomUrl));
  assert.ok(message.includes("🔗 Join here:"));
  assert.equal(countOccurrences(message, organizationName), 1);
  assert.ok(!message.includes("Your Team Vision"));
});

test("buildInterviewDetailsMessage Spanish zoom invitation mentions organization once", () => {
  const message = buildInterviewDetailsMessage({
    prospectName: "Maria Lopez",
    interviewAtMs,
    timezone,
    recruiterName: "Ana Rivera",
    zoomUrl,
    interviewType: "zoom",
    organizationName,
    language: "es"
  });

  assert.ok(message.includes("Hola Maria,"));
  assert.ok(message.includes("¡Tu entrevista está confirmada!"));
  assert.ok(message.includes("👤 Entrevistador:"));
  assert.ok(message.includes("Ana Rivera"));
  assert.ok(message.includes("📅 Fecha:"));
  assert.ok(message.includes("🕚 Hora:"));
  assert.ok(message.includes(zoomUrl));
  assert.ok(message.includes("🔗 Únete aquí:"));
  assert.equal(countOccurrences(message, organizationName), 1);
  assert.ok(!message.includes(`Tu entrevista con ${organizationName}`));
});

test("buildInterviewDetailsMessage includes office address for in-person interviews", () => {
  const message = buildInterviewDetailsMessage({
    prospectName: "Maria Lopez",
    interviewAtMs,
    timezone,
    recruiterName: "Ana Rivera",
    interviewType: "office",
    office: {
      name: "Team Vision Office",
      fullAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    },
    organizationName,
    language: "en"
  });

  assert.ok(message.includes("👤 Interviewer:"));
  assert.ok(message.includes("Ana Rivera"));
  assert.ok(message.includes("2500 NW 79th Ave"));
  assert.ok(!message.includes("zoom.us"));
});

test("composeWhatsAppMessage resolves Spanish interview details from prospect language context", () => {
  const message = composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language: "es",
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs,
    timezone,
    zoomUrl,
    interviewType: "zoom",
    organizationName
  });

  assert.ok(message.includes("Hola Maria,"));
  assert.ok(message.includes("Ana Rivera"));
  assert.ok(message.includes("¡Esperamos conversar contigo!"));
});

test("buildRepresentativeProfileFromUser maps future-ready representative fields", () => {
  const profile = buildRepresentativeProfileFromUser({
    display_name: "Ana Rivera",
    rep_id: "4TJLK",
    phone: "+15555550123",
    email: "ana@example.com",
    preferred_language: "es",
    timezone: "America/New_York"
  });

  assert.equal(profile.name, "Ana Rivera");
  assert.equal(profile.repId, "4TJLK");
  assert.equal(profile.phone, "+15555550123");
  assert.equal(profile.email, "ana@example.com");
  assert.equal(profile.preferredLanguage, "es");
  assert.equal(profile.timezone, "America/New_York");
});

test("resolveOrganizationName derives brand name from office settings", () => {
  assert.equal(
    resolveOrganizationName({
      office: { name: "Team Vision Office", fullAddress: "2500 NW 79th Ave" }
    }),
    "Team Vision"
  );
});

test("resolveAssignedRepresentative uses appointment interviewer assignment", async () => {
  const resolved = await resolveAssignedRepresentative(
    {
      id: "appt-1",
      ownerRepId: "4TJLK",
      interviewerUserId: "interviewer-user",
      interviewerName: "Niovel Perez",
      organizationId: "org-1"
    },
    {
      organizationId: "org-1",
      actorUser: { display_name: "Operator User", rep_id: "9ZZZZ" }
    },
    {
      findUserById: async (userId) =>
        userId === "interviewer-user"
          ? {
              id: "interviewer-user",
              display_name: "Niovel Perez",
              rep_id: "5AAAA",
              email: "niovel@example.com"
            }
          : null,
      sanitizeUser: (user) => user
    }
  );

  assert.equal(resolved.fallbackUsed, false);
  assert.equal(resolved.profile.name, "Niovel Perez");
  assert.equal(resolved.interviewerUserId, "interviewer-user");
});

test("resolveAssignedRepresentative ignores owner rep when interviewer is assigned", async () => {
  const resolved = await resolveAssignedRepresentative(
    {
      id: "appt-1",
      ownerRepId: "4TJLK",
      interviewerUserId: "interviewer-user",
      interviewerName: "Niovel Perez",
      organizationId: "org-1"
    },
    { organizationId: "org-1" },
    {
      findUserById: async () => ({
        id: "interviewer-user",
        display_name: "Niovel Perez",
        rep_id: "5AAAA"
      }),
      sanitizeUser: (user) => user
    }
  );

  assert.equal(resolved.profile.name, "Niovel Perez");
  assert.notEqual(resolved.profile.repId, "4TJLK");
});

test("resolveAssignedRepresentative falls back to agent id when interviewer user missing", async () => {
  const resolved = await resolveAssignedRepresentative(
    {
      id: "appt-1",
      agentId: "agent-user",
      organizationId: "org-1"
    },
    { organizationId: "org-1" },
    {
      findUserById: async (userId) =>
        userId === "agent-user"
          ? {
              id: "agent-user",
              display_name: "Authenticated Agent",
              rep_id: "9ZZZZ"
            }
          : null,
      sanitizeUser: (user) => user
    }
  );

  assert.equal(resolved.fallbackUsed, false);
  assert.equal(resolved.profile.name, "Authenticated Agent");
});
