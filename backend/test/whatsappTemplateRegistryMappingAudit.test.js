/**
 * BR-078 — Meta template registry mapping audit.
 * Verifies canonical EN/ES Meta names, es_v2 missed-appointment rule, fail-closed stale names.
 * No live WhatsApp. No Railway activation. No template execution enablement.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CANONICAL_META_TEMPLATE_NAMES,
  STALE_META_TEMPLATE_NAMES,
  getCanonicalMetaTemplateName,
  isStaleMetaTemplateName,
  getApprovedTemplateRegistry,
  resolveApprovedTemplate,
  listRegistryKeys
} = require("../core/whatsappApprovedTemplateRegistry");
const { authorizeWhatsAppOutbound } = require("../core/whatsappOutboundAuthorizationGate");
const { evaluateCustomerCareWindowFromInboundAt } = require("../core/whatsappCustomerCareWindow");
const { isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");

const NOW = Date.parse("2026-08-07T18:00:00.000Z");
const CLOSED_WINDOW = async () =>
  evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: "2026-08-01T10:00:00.000Z",
    now: NOW
  });

function activateCanonical(key, locale) {
  const name = getCanonicalMetaTemplateName(key, locale);
  assert.ok(name, `canonical missing for ${key}/${locale}`);
  return getApprovedTemplateRegistry(
    JSON.stringify({
      [key]: {
        [locale]: {
          metaTemplateName: name,
          approved: true,
          active: true
        }
      }
    })
  );
}

function resolve(key, locale, variables = { prospect_first_name: "Maria" }) {
  const registry = activateCanonical(key, locale);
  const language = locale === "spanish" ? "spanish" : "english";
  return resolveApprovedTemplate({
    templateKey: key,
    prospect: { preferred_language: language },
    variables,
    buttonVariables:
      key === "zoom_invitation"
        ? { meeting_url: "https://us02web.zoom.us/j/555111222" }
        : {},
    registry
  });
}

test("1. reminder EN/ES mapping", () => {
  assert.equal(
    getCanonicalMetaTemplateName("interview_reminder", "english"),
    "atlas_interview_reminder_en"
  );
  assert.equal(
    getCanonicalMetaTemplateName("interview_reminder", "spanish"),
    "atlas_interview_reminder_es"
  );
  const en = resolve("interview_reminder", "english", {
    prospect_first_name: "Maria",
    interview_when: "Monday 10:00 AM",
    meeting_type: "Zoom"
  });
  const es = resolve("interview_reminder", "spanish", {
    prospect_first_name: "Maria",
    interview_when: "lunes 10:00 AM",
    meeting_type: "Zoom"
  });
  assert.equal(en.ok, true);
  assert.equal(en.metaTemplateName, "atlas_interview_reminder_en");
  assert.equal(es.ok, true);
  assert.equal(es.metaTemplateName, "atlas_interview_reminder_es");
});

test("2. confirmation EN/ES mapping", () => {
  const vars = {
    prospect_first_name: "Maria",
    interview_when: "Monday 10:00 AM",
    meeting_type: "Zoom",
    meeting_location: "Zoom"
  };
  assert.equal(
    resolve("interview_confirmation", "english", vars).metaTemplateName,
    "atlas_interview_confirmation_en"
  );
  assert.equal(
    resolve("interview_confirmation", "spanish", vars).metaTemplateName,
    "atlas_interview_confirmation_es"
  );
});

test("3. details EN/ES mapping", () => {
  const vars = {
    prospect_first_name: "Maria",
    interview_when: "Monday 10:00 AM",
    meeting_type: "Zoom",
    meeting_location: "Zoom"
  };
  assert.equal(
    resolve("interview_details", "english", vars).metaTemplateName,
    "atlas_interview_details_en"
  );
  assert.equal(
    resolve("interview_details", "spanish", vars).metaTemplateName,
    "atlas_interview_details_es"
  );
});

test("4. missed appointment EN mapping", () => {
  assert.equal(
    getCanonicalMetaTemplateName("missed_appointment", "english"),
    "atlas_missed_appointment_en"
  );
  assert.equal(
    resolve("missed_appointment", "english").metaTemplateName,
    "atlas_missed_appointment_en"
  );
});

test("5. missed appointment ES -> _es_v2", () => {
  assert.equal(
    getCanonicalMetaTemplateName("missed_appointment", "spanish"),
    "atlas_missed_appointment_es_v2"
  );
  assert.equal(
    resolve("missed_appointment", "spanish").metaTemplateName,
    "atlas_missed_appointment_es_v2"
  );
});

test("6. old missed appointment ES not selected", () => {
  assert.ok(STALE_META_TEMPLATE_NAMES.includes("atlas_missed_appointment_es"));
  assert.equal(isStaleMetaTemplateName("atlas_missed_appointment_es"), true);
  assert.notEqual(
    CANONICAL_META_TEMPLATE_NAMES.missed_appointment.spanish,
    "atlas_missed_appointment_es"
  );

  const registry = getApprovedTemplateRegistry(
    JSON.stringify({
      missed_appointment: {
        spanish: {
          metaTemplateName: "atlas_missed_appointment_es",
          approved: true,
          active: true
        }
      }
    })
  );
  assert.equal(registry.missed_appointment.locales.spanish.active, false);
  assert.equal(registry.missed_appointment.locales.spanish.approved, false);
  assert.equal(registry.missed_appointment.locales.spanish.metaTemplateName, null);
  assert.ok(
    (registry.__diagnostics.invalidLocales || []).some(
      (row) => row.reason === "STALE_META_TEMPLATE_NAME"
    )
  );

  const resolved = resolveApprovedTemplate({
    templateKey: "missed_appointment",
    prospect: { preferred_language: "spanish" },
    variables: { prospect_first_name: "Maria" },
    registry
  });
  assert.equal(resolved.ok, false);
  assert.notEqual(resolved.metaTemplateName, "atlas_missed_appointment_es");
});

test("7. Zoom invitation EN/ES", () => {
  assert.equal(
    resolve("zoom_invitation", "english").metaTemplateName,
    "atlas_zoom_invitation_en"
  );
  assert.equal(
    resolve("zoom_invitation", "spanish").metaTemplateName,
    "atlas_zoom_invitation_es"
  );
});

test("8. office location EN/ES", () => {
  const vars = {
    prospect_first_name: "Maria",
    meeting_address: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
  };
  assert.equal(
    resolve("office_location", "english", vars).metaTemplateName,
    "atlas_office_location_en"
  );
  assert.equal(
    resolve("office_location", "spanish", vars).metaTemplateName,
    "atlas_office_location_es"
  );
});

test("9. human assist EN/ES", () => {
  assert.equal(
    resolve("human_assist_notice", "english").metaTemplateName,
    "atlas_human_assist_notice_en"
  );
  assert.equal(
    resolve("human_assist_notice", "spanish").metaTemplateName,
    "atlas_human_assist_notice_es"
  );
});

test("10. unsupported logical key fails closed", () => {
  const registry = activateCanonical("interview_reminder", "english");
  const r = resolveApprovedTemplate({
    templateKey: "not_a_real_template",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "Maria" },
    registry
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "UNKNOWN_TEMPLATE_KEY");
});

test("11. unsupported language behavior", () => {
  // Spanish preferred but only English activated → fail closed (no silent fallback).
  const registry = activateCanonical("interview_reminder", "english");
  const r = resolveApprovedTemplate({
    templateKey: "interview_reminder",
    prospect: { preferred_language: "spanish" },
    variables: {
      prospect_first_name: "Maria",
      interview_when: "lunes",
      meeting_type: "Zoom"
    },
    registry
  });
  assert.equal(r.ok, false);
  assert.ok(
    ["TEMPLATE_NOT_APPROVED", "TEMPLATE_INACTIVE", "META_TEMPLATE_NAME_MISSING"].includes(
      r.reason
    )
  );
});

test("12. missing parameter behavior", () => {
  const registry = activateCanonical("missed_appointment", "english");
  const r = resolveApprovedTemplate({
    templateKey: "missed_appointment",
    prospect: { preferred_language: "english" },
    variables: {},
    registry
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "TEMPLATE_VARIABLES_INVALID");
});

test("13. BR-075 authorization preserved", async () => {
  const registry = activateCanonical("missed_appointment", "english");
  const auth = await authorizeWhatsAppOutbound({
    organizationId: "org-1",
    phone: "+17865550100",
    prospect: {
      id: "p1",
      organization_id: "org-1",
      preferred_language: "english"
    },
    message: "",
    intent: "MISSED_APPOINTMENT",
    templateKey: "missed_appointment",
    templateVariables: { prospect_first_name: "Maria" },
    now: NOW,
    evaluateWindow: CLOSED_WINDOW,
    resolveTemplate: (args) =>
      resolveApprovedTemplate({
        ...args,
        registry
      })
  });
  assert.equal(auth.status, "authorized_template");
  assert.equal(auth.metaTemplateName, "atlas_missed_appointment_en");
  assert.equal(auth.authorized, true);

  const injected = resolveApprovedTemplate({
    templateKey: "missed_appointment",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "Maria" },
    callerMetaTemplateName: "atlas_missed_appointment_en",
    registry
  });
  assert.equal(injected.ok, false);
  assert.equal(injected.reason, "CALLER_META_TEMPLATE_NAME_REJECTED");
});

test("14. no live WhatsApp send during test", () => {
  // This suite only resolves/authorizes; no Graph API client is imported.
  const src = fs.readFileSync(__filename, "utf8");
  assert.doesNotMatch(src, /graph\.facebook\.com|sendViaGraphApi\(/);
});

test("15. no Railway variable change marker", () => {
  assert.ok(listRegistryKeys().includes("missed_appointment"));
  // Default registry remains inactive without env activation.
  const idle = getApprovedTemplateRegistry("");
  assert.equal(idle.missed_appointment.locales.spanish.active, false);
  assert.equal(idle.missed_appointment.locales.english.active, false);
});

test("16. Recruit AI v2 execution remains OFF", () => {
  assert.equal(isExecutionEnabled({}), false);
  assert.equal(isExecutionEnabled({ RECRUIT_AI_V2_EXECUTION_ENABLED: "false" }), false);
});

test("canonical map covers required Meta templates", () => {
  const required = [
    ["interview_reminder", "english", "atlas_interview_reminder_en"],
    ["interview_reminder", "spanish", "atlas_interview_reminder_es"],
    ["interview_confirmation", "english", "atlas_interview_confirmation_en"],
    ["interview_confirmation", "spanish", "atlas_interview_confirmation_es"],
    ["interview_details", "english", "atlas_interview_details_en"],
    ["interview_details", "spanish", "atlas_interview_details_es"],
    ["missed_appointment", "english", "atlas_missed_appointment_en"],
    ["missed_appointment", "spanish", "atlas_missed_appointment_es_v2"],
    ["zoom_invitation", "english", "atlas_zoom_invitation_en"],
    ["zoom_invitation", "spanish", "atlas_zoom_invitation_es"],
    ["office_location", "english", "atlas_office_location_en"],
    ["office_location", "spanish", "atlas_office_location_es"],
    ["human_assist_notice", "english", "atlas_human_assist_notice_en"],
    ["human_assist_notice", "spanish", "atlas_human_assist_notice_es"]
  ];
  for (const [key, locale, name] of required) {
    assert.equal(getCanonicalMetaTemplateName(key, locale), name);
  }
});

test("docs mention es_v2 and audit artifact exists", () => {
  const packet = path.join(
    __dirname,
    "../../docs/03-engineering/WHATSAPP_TEMPLATE_APPROVAL_PACKET.md"
  );
  const audit = path.join(
    __dirname,
    "../../docs/03-engineering/WHATSAPP_TEMPLATE_REGISTRY_MAPPING_AUDIT.md"
  );
  assert.equal(fs.existsSync(audit), true);
  const packetText = fs.readFileSync(packet, "utf8");
  const auditText = fs.readFileSync(audit, "utf8");
  assert.match(packetText, /atlas_missed_appointment_es_v2/);
  assert.match(auditText, /atlas_missed_appointment_es_v2/);
  assert.match(packetText, /do \*\*not\*\* use deprecated `atlas_missed_appointment_es`/);
  // Canonical table row must use es_v2, not the old ES name as the preferred mapping.
  assert.match(
    packetText,
    /\| `missed_appointment` \| `atlas_missed_appointment_en` \| `atlas_missed_appointment_es_v2` \|/
  );
});
