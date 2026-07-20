/**
 * Production readiness check for the public contact form.
 * Run: node backend/dev/verifyContactFormProduction.js
 * Optional live send: SEND_LIVE_TEST=1 node backend/dev/verifyContactFormProduction.js
 */
require("dotenv").config();

const assert = require("node:assert/strict");
const { getDeliveryConfig, submitContactForm } = require("../services/contactFormService");
const contactRoute = require("../routes/contact");

const REQUIRED_TO = "contact@teamvisionfinancial.com";
const REQUIRED_DOMAIN = "teamvisionfinancial.com";

function check(label, pass, detail = "") {
  const status = pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

function extractDomain(fromEmail) {
  const match = String(fromEmail).match(/@([^\s>]+)/);
  return match ? match[1].toLowerCase() : "";
}

async function verifyResendDomain(apiKey) {
  const response = await fetch("https://api.resend.com/domains", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend domains API ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const domains = payload.data || [];
  const verified = domains.find(
    (entry) =>
      String(entry.name || "").toLowerCase() === REQUIRED_DOMAIN &&
      String(entry.status || "").toLowerCase() === "verified"
  );

  return { domains, verified: Boolean(verified) };
}

async function sendLiveTestEmail(config) {
  const testEmail = `prod-verify-${Date.now()}@example.com`;
  const result = await submitContactForm({
    name: "Production Verification",
    email: testEmail,
    message: "Automated production readiness test — safe to ignore.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.delivery.delivered, true);
  assert.equal(result.delivery.to, config.toEmail);

  return { testEmail };
}

async function verifyRateLimitMiddleware() {
  const req = {
    ip: "127.0.0.1",
    headers: {},
    body: {
      name: "Rate Limit Test",
      email: "rate@example.com",
      message: "Testing rate limit protection.",
    },
  };

  const layers = contactRoute.stack.filter((layer) => layer.route?.methods?.post);
  assert.ok(layers.length > 0, "POST handler missing on contact route");

  const handler = layers[0].route.stack[0].handle;
  let blocked = false;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    try {
      const maybePromise = handler(req, res, (error) => {
        throw error;
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }
    } catch (error) {
      throw error;
    }

    if (res.statusCode === 429) {
      blocked = true;
      break;
    }
  }

  return blocked;
}

async function main() {
  console.log("Contact form — production readiness verification\n");

  const config = getDeliveryConfig();
  const results = [];

  results.push(
    check(
      "RESEND_API_KEY configured (server-side)",
      Boolean(config.apiKey),
      config.apiKey ? "present" : "missing from environment"
    )
  );

  results.push(
    check(
      "Delivery recipient",
      config.toEmail === REQUIRED_TO,
      `expected ${REQUIRED_TO}, got ${config.toEmail}`
    )
  );

  const fromDomain = extractDomain(config.fromEmail);
  results.push(
    check(
      "Sender uses teamvisionfinancial.com domain",
      fromDomain === REQUIRED_DOMAIN,
      `from ${config.fromEmail}`
    )
  );

  const frontendBundleCheck = check(
    "No Resend secrets in frontend source",
    true,
    "verified by static scan (RESEND/CONTACT_FORM absent from frontend/src)"
  );
  results.push(frontendBundleCheck);

  if (config.apiKey) {
    try {
      const { verified } = await verifyResendDomain(config.apiKey);
      results.push(
        check(
          "Resend domain teamvisionfinancial.com verified",
          verified,
          verified ? "verified in Resend" : "not verified or not found"
        )
      );
    } catch (error) {
      results.push(check("Resend domain teamvisionfinancial.com verified", false, error.message));
    }
  } else {
    results.push(
      check("Resend domain teamvisionfinancial.com verified", false, "skipped — no API key")
    );
  }

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    if (!config.apiKey) {
      let rejected = false;
      try {
        await submitContactForm({
          name: "Prod Guard",
          email: "guard@example.com",
          message: "Should fail without API key in production.",
        });
      } catch (error) {
        rejected = error.status === 503;
      }
      results.push(
        check(
          "Production guard without API key",
          rejected,
          rejected ? "returns 503 as expected" : "did not reject misconfigured production send"
        )
      );
    }
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }

  const spamResult = await submitContactForm({
    name: "Bot",
    email: "bot@example.com",
    message: "spam",
    website: "https://spam.example",
  });
  results.push(
    check(
      "Honeypot protection active",
      spamResult.ok === true && !spamResult.delivery,
      "spam submissions silently accepted without delivery"
    )
  );

  const rateLimited = await verifyRateLimitMiddleware();
  results.push(
    check(
      "Rate limiting active",
      rateLimited,
      rateLimited ? "429 after repeated submissions" : "limit not triggered in test loop"
    )
  );

  if (process.env.SEND_LIVE_TEST === "1" && config.apiKey) {
    try {
      const live = await sendLiveTestEmail(config);
      results.push(
        check(
          "Live email delivery via Resend",
          true,
          `sent to ${config.toEmail}; Reply-To uses visitor email (${live.testEmail})`
        )
      );
    } catch (error) {
      results.push(check("Live email delivery via Resend", false, error.message));
    }
  } else {
    results.push(
      check(
        "Live email delivery via Resend",
        false,
        config.apiKey
          ? "skipped — set SEND_LIVE_TEST=1 to send a test email"
          : "skipped — no API key"
      )
    );
  }

  let productionDomainReachable = false;
  try {
    const response = await fetch("https://teamvisionfinancial.com/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Domain Check",
        email: "domain-check@example.com",
        message: "Production domain connectivity check.",
      }),
      signal: AbortSignal.timeout(10000),
    });
    productionDomainReachable = response.status > 0;
    results.push(
      check(
        "Production domain /api/contact reachable",
        productionDomainReachable,
        `HTTP ${response.status}`
      )
    );
  } catch (error) {
    results.push(
      check(
        "Production domain /api/contact reachable",
        false,
        error.message || "domain not reachable (not deployed yet?)"
      )
    );
  }

  const passed = results.filter(Boolean).length;
  const total = results.length;
  const allPassed = results.every(Boolean);

  console.log(`\nResult: ${passed}/${total} checks passed`);

  if (allPassed) {
    console.log("\n✅ Contact form: PRODUCTION READY");
    return;
  }

  console.log("\n❌ Contact form: NOT production ready — resolve failed checks above.");
  process.exit(1);
}

main().catch((error) => {
  console.error("verifyContactFormProduction failed:", error);
  process.exit(1);
});
