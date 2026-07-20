const assert = require("node:assert/strict");
const {
  sanitizeText,
  validateContactSubmission,
} = require("../core/contactFormValidation");
const { submitContactForm } = require("../services/contactFormService");

async function run() {
  const empty = validateContactSubmission({});
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.name);
  assert.ok(empty.errors.email);
  assert.ok(empty.errors.message);

  const invalidEmail = validateContactSubmission({
    name: "Jane Doe",
    email: "not-an-email",
    message: "Hello",
  });
  assert.equal(invalidEmail.ok, false);
  assert.ok(invalidEmail.errors.email);

  const xss = validateContactSubmission({
    name: "<script>alert(1)</script>Jane",
    email: "jane@example.com",
    message: "  Interested in retirement planning.  ",
  });
  assert.equal(xss.ok, true);
  assert.equal(xss.data.name, "alert(1)Jane");
  assert.equal(xss.data.message, "Interested in retirement planning.");

  const spam = validateContactSubmission({
    name: "Bot",
    email: "bot@example.com",
    message: "spam",
    website: "https://spam.example",
  });
  assert.equal(spam.ok, false);
  assert.equal(spam.spam, true);

  const originalKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  process.env.NODE_ENV = "development";

  const devResult = await submitContactForm({
    name: "Test User",
    email: "test@example.com",
    message: "End-to-end verification message.",
  });

  assert.equal(devResult.ok, true);
  assert.equal(devResult.delivery.mode, "dev-log");

  if (originalKey) {
    process.env.RESEND_API_KEY = originalKey;
  }

  console.log("verifyContactForm: all checks passed");
}

run().catch((error) => {
  console.error("verifyContactForm failed:", error);
  process.exit(1);
});
