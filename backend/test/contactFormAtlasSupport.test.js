/**
 * Contact form validation — Team Vision + Atlas support source.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONTACT_SOURCES,
  ATLAS_CONTACT_TOPICS,
  validateContactSubmission,
  sanitizeText
} = require("../core/contactFormValidation");
const {
  buildEmailSubject,
  buildEmailText,
  submitContactForm
} = require("../services/contactFormService");

test("Team Vision submission still requires name, email, message only", () => {
  const result = validateContactSubmission({
    name: "Jane Doe",
    email: "jane@example.com",
    message: "Hello from the website."
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.source, CONTACT_SOURCES.TEAM_VISION);
  assert.equal(result.data.topic, undefined);
});

test("Team Vision rejects malformed email", () => {
  const result = validateContactSubmission({
    name: "Jane",
    email: "not-an-email",
    message: "Hi"
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.email);
});

test("honeypot still treated as spam", () => {
  const result = validateContactSubmission({
    name: "Bot",
    email: "bot@example.com",
    message: "spam",
    website: "https://spam.example"
  });
  assert.equal(result.ok, false);
  assert.equal(result.spam, true);
});

test("Atlas submission requires topic and accepts optional organization", () => {
  const missingTopic = validateContactSubmission({
    source: "atlas",
    name: "Alex Agent",
    email: "alex@example.com",
    message: "Need help connecting WhatsApp."
  });
  assert.equal(missingTopic.ok, false);
  assert.ok(missingTopic.errors.topic);

  const ok = validateContactSubmission({
    source: "atlas",
    name: "Alex Agent",
    email: "alex@example.com",
    organization: "Team Legacy",
    topic: "WhatsApp / Meta",
    message: "Need help connecting WhatsApp."
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.source, CONTACT_SOURCES.ATLAS);
  assert.equal(ok.data.topic, "WhatsApp / Meta");
  assert.equal(ok.data.organization, "Team Legacy");
});

test("Atlas rejects unknown topic values", () => {
  const result = validateContactSubmission({
    source: "atlas",
    name: "Alex",
    email: "alex@example.com",
    topic: "Not A Real Topic",
    message: "Help"
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.topic);
});

test("Atlas topic catalog matches product options", () => {
  assert.deepEqual(ATLAS_CONTACT_TOPICS, [
    "General Question",
    "Account Access",
    "Technical Support",
    "Google Calendar",
    "WhatsApp / Meta",
    "Billing",
    "Other"
  ]);
});

test("email copy is source-aware", () => {
  const atlas = {
    source: CONTACT_SOURCES.ATLAS,
    name: "Alex",
    email: "alex@example.com",
    topic: "Billing",
    organization: "Acme",
    message: "Invoice question"
  };
  assert.match(buildEmailSubject(atlas), /Atlas support \(Billing\)/);
  assert.match(buildEmailText(atlas), /useatlas-ai.com/);
  assert.match(buildEmailText(atlas), /Organization: Acme/);

  const tv = {
    source: CONTACT_SOURCES.TEAM_VISION,
    name: "Jane",
    email: "jane@example.com",
    message: "Hi"
  };
  assert.equal(buildEmailSubject(tv), "Website contact: Jane");
  assert.match(buildEmailText(tv), /teamvisionfinancial.com/);
});

test("sanitize strips tags", () => {
  assert.equal(sanitizeText("<b>Hi</b>"), "Hi");
});

test("Atlas submitContactForm succeeds in dev-log without Resend key", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  delete process.env.RESEND_API_KEY;
  process.env.NODE_ENV = "development";

  try {
    const result = await submitContactForm({
      source: "atlas",
      name: "Alex Agent",
      email: "alex@example.com",
      topic: "Technical Support",
      message: "Cannot sign in."
    });
    assert.equal(result.ok, true);
    assert.equal(result.delivery.mode, "dev-log");
  } finally {
    if (originalKey) {
      process.env.RESEND_API_KEY = originalKey;
    } else {
      delete process.env.RESEND_API_KEY;
    }
    process.env.NODE_ENV = originalEnv;
  }
});
