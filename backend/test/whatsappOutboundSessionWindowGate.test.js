/**
 * BR-075 — WhatsApp outbound customer-care window and approved-template gate.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CUSTOMER_CARE_WINDOW_MS,
  evaluateCustomerCareWindowFromInboundAt
} = require("../core/whatsappCustomerCareWindow");
const {
  getApprovedTemplateRegistry,
  resolveApprovedTemplate,
  resolveTemplateLanguage
} = require("../core/whatsappApprovedTemplateRegistry");
const {
  authorizeWhatsAppOutbound,
  DELIVERY_STATUSES
} = require("../core/whatsappOutboundAuthorizationGate");
const { buildTemplateComponents } = require("../core/whatsappOutboundPipeline");

const NOW = Date.parse("2026-08-05T18:00:00.000Z");

test("1. recent valid inbound permits free-form authorization", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "CONVERSATION_ENGINE_REPLY",
    phone: "+17865550100",
    message: "What is the job about?",
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: "2026-08-05T17:30:00.000Z",
        now: NOW
      })
  });

  assert.equal(auth.status, "authorized_freeform");
  assert.equal(auth.authorized, true);
  assert.equal(auth.permittedDeliveryMode, "freeform");
});

test("2. expired customer-care window blocks free-form without approved template", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_REMINDER",
    phone: "+17865550100",
    message: "Reminder freeform",
    templateKey: "interview_reminder",
    templateVariables: {
      prospect_first_name: "Ana",
      interview_when: "Fri 1:51 PM",
      meeting_type: "Zoom"
    },
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: "2026-08-04T17:00:00.000Z",
        now: NOW
      })
  });

  assert.equal(auth.authorized, false);
  assert.equal(auth.status, DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED);
});

test("3. no inbound timestamp blocks free-form", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "FOLLOW_UP",
    phone: "+17865550100",
    message: "Checking in",
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({ latestInboundAt: null, now: NOW })
  });

  assert.equal(auth.authorized, false);
  assert.ok(
    [
      DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING,
      DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED
    ].includes(auth.status)
  );
});

test("4. window math ignores outbound-only history by requiring inbound timestamp", () => {
  const evaluation = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: null,
    now: NOW
  });
  assert.equal(evaluation.open, false);
  assert.equal(evaluation.reason, "NO_INBOUND_TIMESTAMP");
});

test("5. invalid or future inbound timestamp fails safely", () => {
  assert.equal(
    evaluateCustomerCareWindowFromInboundAt({
      latestInboundAt: "not-a-date",
      now: NOW
    }).open,
    false
  );

  const future = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: "2026-08-06T18:00:00.000Z",
    now: NOW
  });
  assert.equal(future.open, false);
  assert.equal(future.reason, "FUTURE_INBOUND_TIMESTAMP");
});

test("6. UTC boundary is deterministic at exact expiry", () => {
  const inbound = "2026-08-04T18:00:00.000Z";
  const atExpiry = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: inbound,
    now: Date.parse(inbound) + CUSTOMER_CARE_WINDOW_MS
  });
  const afterExpiry = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: inbound,
    now: Date.parse(inbound) + CUSTOMER_CARE_WINDOW_MS + 1
  });

  assert.equal(atExpiry.open, true);
  assert.equal(afterExpiry.open, false);
});

test("7. window duration is sourced from one canonical constant", () => {
  assert.equal(CUSTOMER_CARE_WINDOW_MS, 24 * 60 * 60 * 1000);
  const evaluation = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: "2026-08-05T10:00:00.000Z",
    now: NOW
  });
  assert.equal(evaluation.windowMs, CUSTOMER_CARE_WINDOW_MS);
});

test("8. outside-window approved template authorizes successfully", async () => {
  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      interview_reminder: {
        english: {
          metaTemplateName: "tv_interview_reminder_en",
          approved: true,
          active: true
        }
      }
    })
  );

  const auth = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_REMINDER",
    phone: "+17865550100",
    message: "ignored outside window",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    templateVariables: {
      prospect_first_name: "Ana",
      interview_when: "Fri 1:51 PM",
      meeting_type: "Zoom"
    },
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: "2026-08-01T10:00:00.000Z",
        now: NOW
      }),
    resolveTemplate: (input) => resolveApprovedTemplate({ ...input, registry })
  });

  assert.equal(auth.status, "authorized_template");
  assert.equal(auth.metaTemplateName, "tv_interview_reminder_en");
  assert.equal(auth.language, "english");
});

test("9. outside-window missing template fails closed", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "NO_RESPONSE_FOLLOW_UP",
    phone: "+17865550100",
    message: "freeform follow up",
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: "2026-08-01T10:00:00.000Z",
        now: NOW
      })
  });

  assert.equal(auth.authorized, false);
  assert.ok(
    auth.status === DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING ||
      auth.status === DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED
  );
});

test("10-12. unapproved, inactive, and caller-supplied template names are rejected", () => {
  const unapproved = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: {
      prospect_first_name: "A",
      interview_when: "now",
      meeting_type: "Zoom"
    }
  });
  assert.equal(unapproved.ok, false);
  assert.equal(unapproved.status, "blocked_template_unapproved");

  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      interview_reminder: {
        english: {
          metaTemplateName: "tv_interview_reminder_en",
          approved: true,
          active: false
        }
      }
    })
  );
  const inactive = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: {
      prospect_first_name: "A",
      interview_when: "now",
      meeting_type: "Zoom"
    },
    registry
  });
  assert.equal(inactive.ok, false);

  const caller = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: {
      prospect_first_name: "A",
      interview_when: "now",
      meeting_type: "Zoom"
    },
    callerMetaTemplateName: "evil_template",
    registry
  });
  assert.equal(caller.ok, false);
  assert.equal(caller.reason, "CALLER_META_TEMPLATE_NAME_REJECTED");
});

test("13. template variables are validated", () => {
  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      interview_reminder: {
        spanish: {
          metaTemplateName: "tv_interview_reminder_es",
          approved: true,
          active: true
        }
      }
    })
  );

  const missing = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "spanish" },
    variables: { prospect_first_name: "Ofelia" },
    registry
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "TEMPLATE_VARIABLES_INVALID");
});

test("14-16. preferred language selects locale and does not fall back across languages", () => {
  assert.equal(resolveTemplateLanguage({ preferred_language: "spanish" }), "spanish");
  assert.equal(
    resolveTemplateLanguage({ preferred_language: "english", language: "es" }),
    "english"
  );
  assert.equal(resolveTemplateLanguage({ language: "es" }), "english");

  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      interview_reminder: {
        spanish: {
          metaTemplateName: "tv_interview_reminder_es",
          approved: true,
          active: true
        }
      }
    })
  );

  const spanish = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "spanish" },
    variables: { prospect_first_name: "Ofelia", interview_when: "viernes", meeting_type: "Zoom" },
    registry
  });
  assert.equal(spanish.ok, true);
  assert.equal(spanish.languageCode, "es");

  const englishMissing = resolveApprovedTemplate({
    intent: "APPOINTMENT_REMINDER",
    templateKey: "interview_reminder",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "Ana", interview_when: "Friday", meeting_type: "Zoom" },
    registry
  });
  assert.equal(englishMissing.ok, false);
});

test("17-19. reminder authorization inside/outside window", async () => {
  const inside = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_REMINDER",
    phone: "+17865550111",
    message: "Hola, recordatorio",
    templateKey: "interview_reminder",
    templateVariables: { prospect_first_name: "Ana", interview_when: "tomorrow", meeting_type: "Zoom" },
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: "2026-08-05T17:50:00.000Z",
        now: NOW
      })
  });
  assert.equal(inside.status, "authorized_freeform");

  const outside = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_REMINDER",
    phone: "+17865550111",
    message: "Hola, recordatorio",
    templateKey: "interview_reminder",
    templateVariables: { prospect_first_name: "Ana", interview_when: "tomorrow", meeting_type: "Zoom" },
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: "2026-08-01T17:50:00.000Z",
        now: NOW
      })
  });
  assert.notEqual(outside.status, "authorized_freeform");
  assert.equal(outside.authorized, false);
});

test("20-24. follow-up, missed appointment, reschedule, human-assist, and agent intents use the gate", async () => {
  const intents = [
    "NO_RESPONSE_FOLLOW_UP",
    "MISSED_APPOINTMENT",
    "RESCHEDULE_CONFIRMATION",
    "HUMAN_ASSIST",
    "AGENT_ACTION"
  ];

  for (const intent of intents) {
    const auth = await authorizeWhatsAppOutbound({
      intent,
      phone: "+17865550122",
      message: "freeform should not send",
      now: NOW,
      evaluateWindow: async () =>
        evaluateCustomerCareWindowFromInboundAt({
          latestInboundAt: "2026-07-01T00:00:00.000Z",
          now: NOW
        })
    });
    assert.equal(auth.authorized, false, intent);
    assert.notEqual(auth.status, "authorized_freeform", intent);
  }
});

test("25-27. blocked delivery result is retryable and does not look like sent", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "APPOINTMENT_REMINDER",
    phone: "+17865550133",
    message: "reminder",
    templateKey: "interview_reminder",
    templateVariables: { prospect_first_name: "A", interview_when: "B", meeting_type: "Zoom" },
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: null,
        now: NOW
      })
  });

  assert.equal(auth.retryable, true);
  assert.notEqual(auth.status, DELIVERY_STATUSES.SENT_FREEFORM);
  assert.notEqual(auth.status, DELIVERY_STATUSES.SENT_TEMPLATE);
  assert.equal(auth.channel, "whatsapp");
  assert.ok(auth.timestamp);
});

test("28. template component builder is deterministic for idempotent payloads", () => {
  const components = buildTemplateComponents(
    ["prospect_first_name", "interview_when", "meeting_type"],
    { prospect_first_name: "Ana", interview_when: "Fri", meeting_type: "Zoom" }
  );
  assert.equal(components[0].parameters.length, 3);
  assert.equal(components[0].parameters[0].text, "Ana");
  assert.equal(components[0].parameters[2].text, "Zoom");
});

test("29-30. delivery audit result is sanitized (no token fields)", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "CONVERSATION_ENGINE_REPLY",
    phone: "+17865550144",
    message: "Hello",
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: "2026-08-05T17:59:00.000Z",
        now: NOW
      })
  });

  const serialized = JSON.stringify(auth);
  assert.equal(serialized.includes("accessToken"), false);
  assert.equal(serialized.includes("Bearer"), false);
  assert.equal(auth.channel, "whatsapp");
});

test("31-32. registry keys are org-configuration driven and unknown keys rejected", () => {
  const unknown = resolveApprovedTemplate({
    templateKey: "not_a_real_key",
    intent: "APPOINTMENT_REMINDER",
    prospect: { preferred_language: "english" },
    variables: {}
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, "UNKNOWN_TEMPLATE_KEY");
});

test("33. immediate Recruit AI reply after valid inbound still authorizes freeform", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "CONVERSATION_ENGINE_REPLY",
    phone: "+17865550155",
    message: "It is an opportunity in financial services. Are you currently authorized to work?",
    now: NOW,
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: new Date(NOW - 60_000).toISOString(),
        now: NOW
      })
  });
  assert.equal(auth.status, "authorized_freeform");
});

test("Meta Review allowlist and securities surfaces remain untouched by this hotfix", () => {
  const metaReviewTest = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/config/metaReviewWorkspace.test.js"),
    "utf8"
  );
  assert.match(metaReviewTest, /meta_review_user|language lock|WhatsApp/i);

  const metaReviewMode = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/config/metaReviewMode.js"),
    "utf8"
  );
  assert.match(metaReviewMode, /META_REVIEW|meta_review/i);

  const securities = fs.readFileSync(
    path.join(__dirname, "../database/migrations/026_securities_access_authorization.sql"),
    "utf8"
  );
  assert.match(securities, /securities/i);
});
