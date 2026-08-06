const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeCommunicationsCenterResponse,
  sanitizeCorrelationId,
  assertNoRawContactLeak
} = require("../core/communicationsCenterSanitizer");

test("correlation IDs with E.164 become masked-contact form", () => {
  const out = sanitizeCorrelationId("advance:+17865557338:slot-offer");
  assert.equal(out, "advance:<masked-contact>:slot-offer");
  assert.doesNotMatch(out, /\+1\d{10}/);
});

test("recursive sanitizer removes phones, emails, and tokens from metadata", () => {
  const payload = {
    prospect: {
      id: "p1",
      currentContact: { channel: "whatsapp", maskedAddress: "***7338" }
    },
    items: [
      {
        metadata: {
          correlationId: "advance:+13059997338:abc",
          phone: "+13059997338",
          email: "agent@example.com",
          authorization: "Bearer supersecrettokenvalue0123456789",
          nested: {
            note: "Call (305) 999-7338 please",
            providerMessageId: "wamid.ABCDEFGHIJKLMNOPQRSTUVWXYZ"
          }
        }
      }
    ]
  };

  const sanitized = sanitizeCommunicationsCenterResponse(payload);
  const check = assertNoRawContactLeak(sanitized);
  assert.equal(check.ok, true, JSON.stringify(check.violations));
  assert.equal(
    sanitized.items[0].metadata.correlationId,
    "advance:<masked-contact>:abc"
  );
  assert.equal(sanitized.items[0].metadata.phone, "***7338");
  assert.match(sanitized.items[0].metadata.email, /\*{3}/);
  assert.equal(sanitized.items[0].metadata.authorization, "<redacted>");
  assert.doesNotMatch(JSON.stringify(sanitized), /\+13059997338/);
  assert.doesNotMatch(JSON.stringify(sanitized), /305\)?\s*999/);
});

test("sanitizer does not mutate the source object", () => {
  const source = {
    metadata: { correlationId: "advance:+15551234567:x" }
  };
  const cloneBefore = JSON.stringify(source);
  sanitizeCommunicationsCenterResponse(source);
  assert.equal(JSON.stringify(source), cloneBefore);
});

test("assertNoRawContactLeak catches E.164 and bearer tokens", () => {
  assert.equal(assertNoRawContactLeak({ a: "+15551234567" }).ok, false);
  assert.equal(
    assertNoRawContactLeak({ a: "Bearer abcdefghijklmnop" }).ok,
    false
  );
  assert.equal(
    assertNoRawContactLeak({
      prospect: { currentContact: { maskedAddress: "***4567" } }
    }).ok,
    true
  );
});
