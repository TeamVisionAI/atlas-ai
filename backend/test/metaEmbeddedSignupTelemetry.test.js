const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("meta onboarding exposes embedded signup telemetry stages", () => {
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "../routes/metaOnboarding.js"),
    "utf8"
  );

  assert.match(routeSrc, /embedded_signup_client_started/);
  assert.match(routeSrc, /embedded_signup_oauth_received/);
  assert.match(routeSrc, /embedded_signup_finish_received/);
  assert.match(routeSrc, /embedded_signup_exchange_requested/);
  assert.match(routeSrc, /embedded_signup_exchange_completed/);
  assert.match(routeSrc, /embedded_signup_status_verified/);
  assert.match(routeSrc, /embedded_signup_partial_timeout/);
  assert.match(routeSrc, /router\.post\("\/embedded-signup\/telemetry"/);
});
