const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveProspectEmail,
  shouldAttemptEmailDelivery
} = require("../core/communicationChannelEngine");

test("resolveProspectEmail reads email field and notes token", () => {
  assert.equal(
    resolveProspectEmail({ email: "maria@example.com", notes: "Lead" }),
    "maria@example.com"
  );
  assert.equal(
    resolveProspectEmail({ notes: "Lead|EMAIL:prospect@example.com" }),
    "prospect@example.com"
  );
  assert.equal(resolveProspectEmail({ notes: "Lead only" }), null);
});

test("shouldAttemptEmailDelivery skips WhatsApp-only requests", () => {
  assert.equal(
    shouldAttemptEmailDelivery({
      prospect: { email: "maria@example.com" },
      organizationId: "org-1",
      forceWhatsApp: true
    }),
    false
  );

  assert.equal(
    shouldAttemptEmailDelivery({
      prospect: { email: "maria@example.com" },
      organizationId: "org-1"
    }),
    true
  );
});
