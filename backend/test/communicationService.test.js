const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WHATSAPP_TEMPLATES,
  resolveInterviewDetailsTemplate,
  resolveInterviewTypeFromAppointment,
  buildInterviewDetailsMessage,
  composeWhatsAppMessage,
  resolveOrganizationName
} = require("../core/whatsappCommunicationEngine");
const { buildRepresentativeProfileFromUser, resolveAssignedRepresentative } = require("../core/representativeProfileEngine");

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

test("buildInterviewDetailsMessage includes representative and zoom link", () => {
  const message = buildInterviewDetailsMessage({
    prospectName: "Maria Lopez",
    interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
    timezone: "America/New_York",
    recruiterName: "Ana Rivera",
    zoomUrl: "https://zoom.us/j/123456789",
    interviewType: "zoom",
    organizationName: "Team Vision",
    language: "en"
  });

  assert.ok(message.includes("Hi Maria,"));
  assert.ok(message.includes("Representative: Ana Rivera"));
  assert.ok(message.includes("Date:"));
  assert.ok(message.includes("Time:"));
  assert.ok(message.includes("https://zoom.us/j/123456789"));
  assert.ok(message.includes("Reminder:"));
  assert.ok(message.includes("Team Vision"));
  assert.ok(!message.includes("Team Vision Office"));
});

test("buildInterviewDetailsMessage includes office address for in-person interviews", () => {
  const message = buildInterviewDetailsMessage({
    prospectName: "Maria Lopez",
    interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
    timezone: "America/New_York",
    recruiterName: "Ana Rivera",
    interviewType: "office",
    office: {
      name: "Team Vision Office",
      fullAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
    },
    organizationName: "Team Vision",
    language: "en"
  });

  assert.ok(message.includes("Representative: Ana Rivera"));
  assert.ok(message.includes("2500 NW 79th Ave"));
  assert.ok(!message.includes("zoom.us"));
});

test("composeWhatsAppMessage resolves Spanish interview details from prospect language context", () => {
  const message = composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language: "es",
    prospectName: "Maria Lopez",
    recruiterName: "Ana Rivera",
    interviewAtMs: Date.parse("2026-03-15T18:30:00.000Z"),
    timezone: "America/New_York",
    zoomUrl: "https://zoom.us/j/123456789",
    interviewType: "zoom",
    organizationName: "Team Vision"
  });

  assert.ok(message.includes("Hola Maria,"));
  assert.ok(message.includes("Representante: Ana Rivera"));
  assert.ok(message.includes("Recordatorio:"));
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

test("resolveAssignedRepresentative prefers owner rep over operator fallback", async () => {
  const resolved = await resolveAssignedRepresentative(
    { id: "appt-1", ownerRepId: "4TJLK", organizationId: "org-1" },
    {
      organizationId: "org-1",
      actorUser: { display_name: "Operator User", rep_id: "9ZZZZ" }
    },
    {
      findUserByRepId: async () => ({
        id: "rep-user",
        display_name: "Assigned Rep",
        rep_id: "4TJLK",
        email: "rep@example.com"
      }),
      sanitizeUser: (user) => user
    }
  );

  assert.equal(resolved.fallbackUsed, false);
  assert.equal(resolved.profile.name, "Assigned Rep");
  assert.equal(resolved.profile.repId, "4TJLK");
});

test("resolveAssignedRepresentative falls back to operator when owner rep is missing", async () => {
  const resolved = await resolveAssignedRepresentative(
    { id: "appt-1", ownerRepId: "4TJLK", organizationId: "org-1" },
    {
      organizationId: "org-1",
      actorUser: { display_name: "Operator User", rep_id: "9ZZZZ" }
    },
    {
      findUserByRepId: async () => null,
      sanitizeUser: (user) => user
    }
  );

  assert.equal(resolved.fallbackUsed, true);
  assert.equal(resolved.profile.name, "Operator User");
});
