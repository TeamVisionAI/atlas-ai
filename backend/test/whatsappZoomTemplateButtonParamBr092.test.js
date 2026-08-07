/**
 * BR-092 — WhatsApp Zoom template dynamic URL button parameter normalization.
 * Meta base: https://zoom.us/j/{{1}} — parameter must be meeting-id suffix only.
 * No live WhatsApp. No Railway activation. Templates remain inactive.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CANONICAL_META_TEMPLATE_NAMES,
  STALE_META_TEMPLATE_NAMES,
  getCanonicalMetaTemplateName,
  getApprovedTemplateRegistry,
  resolveApprovedTemplate,
  isStaleMetaTemplateName
} = require("../core/whatsappApprovedTemplateRegistry");
const {
  buildZoomInvitationVariables,
  normalizeZoomDynamicUrlButtonParameter,
  META_ZOOM_INVITATION_URL_BUTTON_BASE
} = require("../core/whatsappTemplateVariableBuilder");
const { buildTemplateComponents } = require("../core/whatsappOutboundPipeline");
const { isApprovedHttpsZoomUrl } = require("../core/virtualMeetingUrlResolver");
const { authorizeWhatsAppOutbound } = require("../core/whatsappOutboundAuthorizationGate");
const { evaluateCustomerCareWindowFromInboundAt } = require("../core/whatsappCustomerCareWindow");
const { isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");

const NOW = Date.parse("2026-08-07T18:00:00.000Z");
const CLOSED_WINDOW = async () =>
  evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: "2026-08-01T10:00:00.000Z",
    now: NOW
  });

const CANONICAL_ZOOM = "https://zoom.us/j/123456789";
const SUBDOMAIN_ZOOM = "https://us02web.zoom.us/j/555111222";

function activateZoom(locale) {
  const name = getCanonicalMetaTemplateName("zoom_invitation", locale);
  return getApprovedTemplateRegistry(
    JSON.stringify({
      zoom_invitation: {
        [locale]: {
          metaTemplateName: name,
          approved: true,
          active: true
        }
      }
    })
  );
}

test("1. canonical URL → Meta button parameter", () => {
  const result = normalizeZoomDynamicUrlButtonParameter(CANONICAL_ZOOM);
  assert.equal(result.ok, true);
  assert.equal(result.parameter, "123456789");
  assert.equal(META_ZOOM_INVITATION_URL_BUTTON_BASE + result.parameter, CANONICAL_ZOOM);
});

test("2. j/123456789 → 123456789", () => {
  assert.equal(normalizeZoomDynamicUrlButtonParameter("j/123456789").parameter, "123456789");
});

test("3. /j/123456789 → 123456789", () => {
  assert.equal(normalizeZoomDynamicUrlButtonParameter("/j/123456789").parameter, "123456789");
});

test("4. already normalized → 123456789", () => {
  assert.equal(normalizeZoomDynamicUrlButtonParameter("123456789").parameter, "123456789");
});

test("5. no j/j duplication in pipeline components", () => {
  const components = buildTemplateComponents(
    ["prospect_first_name"],
    { prospect_first_name: "Ana" },
    ["meeting_url"],
    { meeting_url: CANONICAL_ZOOM }
  );
  const buttonText = components[1].parameters[0].text;
  assert.equal(buttonText, "123456789");
  assert.equal(buttonText.startsWith("j/"), false);
  assert.equal(buttonText.includes("j/j/"), false);
  assert.equal(
    `${META_ZOOM_INVITATION_URL_BUTTON_BASE}${buttonText}`,
    "https://zoom.us/j/123456789"
  );

  const fromRelative = buildTemplateComponents(
    ["prospect_first_name"],
    { prospect_first_name: "Ana" },
    ["meeting_url"],
    { meeting_url: "j/123456789" }
  );
  assert.equal(fromRelative[1].parameters[0].text, "123456789");
});

test("6. English Zoom template mapping", () => {
  const vars = buildZoomInvitationVariables({ name: "Maria Lopez" }, CANONICAL_ZOOM);
  const resolved = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "english" },
    variables: vars.variables,
    buttonVariables: vars.buttonVariables,
    registry: activateZoom("english")
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.metaTemplateName, "atlas_zoom_invitation_en");
  assert.equal(resolved.languageCode, "en");
  assert.equal(resolved.buttonVariables.meeting_url, "123456789");
});

test("7. Spanish Zoom template mapping", () => {
  const vars = buildZoomInvitationVariables({ name: "Maria Lopez" }, CANONICAL_ZOOM);
  const resolved = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "spanish" },
    variables: vars.variables,
    buttonVariables: vars.buttonVariables,
    registry: activateZoom("spanish")
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.metaTemplateName, "atlas_zoom_invitation_es");
  assert.equal(resolved.languageCode, "es");
  assert.equal(resolved.buttonVariables.meeting_url, "123456789");
});

test("8-9. BODY remains name; BUTTON is separate dynamic URL parameter", () => {
  const vars = buildZoomInvitationVariables({ name: "Ana Rivera" }, SUBDOMAIN_ZOOM);
  assert.equal(vars.ok, true);
  assert.equal(vars.variables.prospect_first_name, "Ana");
  assert.equal(Object.keys(vars.variables).join(","), "prospect_first_name");
  assert.equal(vars.buttonVariables.meeting_url, "555111222");
  assert.equal(Object.keys(vars.buttonVariables).join(","), "meeting_url");
  assert.notEqual(vars.variables.prospect_first_name, vars.buttonVariables.meeting_url);

  const components = buildTemplateComponents(
    ["prospect_first_name"],
    vars.variables,
    ["meeting_url"],
    vars.buttonVariables
  );
  assert.equal(components[0].type, "body");
  assert.equal(components[0].parameters[0].text, "Ana");
  assert.equal(components[1].type, "button");
  assert.equal(components[1].sub_type, "url");
  assert.equal(components[1].parameters[0].text, "555111222");
});

test("10. missing Zoom value fails closed", () => {
  assert.equal(buildZoomInvitationVariables({ name: "Ana" }, null).ok, false);
  assert.equal(buildZoomInvitationVariables({ name: "Ana" }, "").ok, false);
  assert.equal(normalizeZoomDynamicUrlButtonParameter("").ok, false);
  assert.throws(
    () =>
      buildTemplateComponents(
        ["prospect_first_name"],
        { prospect_first_name: "Ana" },
        ["meeting_url"],
        {}
      ),
    /ZOOM_BUTTON_PARAM_MISSING|MEETING_URL/
  );
});

test("11. malformed URL fails closed", () => {
  assert.equal(normalizeZoomDynamicUrlButtonParameter("https://zoom.us/%").ok, false);
  assert.equal(normalizeZoomDynamicUrlButtonParameter("not a url").ok, false);
  assert.equal(normalizeZoomDynamicUrlButtonParameter("https://").ok, false);
  assert.equal(buildZoomInvitationVariables({ name: "Ana" }, "https://zoom.us/%").ok, false);
});

test("12. arbitrary non-Zoom URL fails closed", () => {
  assert.equal(
    normalizeZoomDynamicUrlButtonParameter("https://example.com/j/123456789").ok,
    false
  );
  assert.equal(
    buildZoomInvitationVariables({ name: "Ana" }, "https://meet.google.com/abc-defg-hij").ok,
    false
  );
  const resolved = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "Ana" },
    buttonVariables: { meeting_url: "https://example.com/j/123" },
    registry: activateZoom("english")
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, "TEMPLATE_BUTTON_VARIABLES_INVALID");
});

test("13. stale/unapproved template name fails closed", () => {
  assert.equal(isStaleMetaTemplateName("atlas_missed_appointment_es"), true);
  assert.ok(STALE_META_TEMPLATE_NAMES.includes("atlas_missed_appointment_es"));

  const staleZoom = getApprovedTemplateRegistry(
    JSON.stringify({
      zoom_invitation: {
        english: {
          metaTemplateName: "atlas_missed_appointment_es",
          approved: true,
          active: true
        }
      }
    })
  );
  assert.equal(staleZoom.zoom_invitation.locales.english.active, false);
  assert.equal(staleZoom.zoom_invitation.locales.english.metaTemplateName, null);
  assert.ok(
    (staleZoom.__diagnostics.invalidLocales || []).some(
      (row) => row.reason === "STALE_META_TEMPLATE_NAME"
    )
  );
  const blocked = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "Ana" },
    buttonVariables: { meeting_url: "123456789" },
    registry: staleZoom
  });
  assert.equal(blocked.ok, false);
  assert.notEqual(blocked.metaTemplateName, "atlas_missed_appointment_es");

  const inactive = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "Ana" },
    buttonVariables: { meeting_url: "123456789" }
  });
  assert.equal(inactive.ok, false);
});

test("14. BR-076 compatibility — approved Zoom hosts normalize; storage URL unchanged", () => {
  assert.equal(isApprovedHttpsZoomUrl(CANONICAL_ZOOM), true);
  assert.equal(isApprovedHttpsZoomUrl(SUBDOMAIN_ZOOM), true);
  assert.equal(isApprovedHttpsZoomUrl("https://zoom.gov/j/999"), true);
  assert.equal(
    normalizeZoomDynamicUrlButtonParameter("https://zoom.gov/j/999").parameter,
    "999"
  );
  // Builder adapts button param only; canonical input string is not rewritten in-place.
  const input = "https://us02web.zoom.us/j/555111222?pwd=secret";
  const vars = buildZoomInvitationVariables({ name: "Ana" }, input);
  assert.equal(vars.ok, true);
  assert.equal(vars.buttonVariables.meeting_url, "555111222?pwd=secret");
  assert.equal(input, "https://us02web.zoom.us/j/555111222?pwd=secret");
});

test("15. BR-075 authorization preserved — inactive default registry blocks outside window", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "SEND_ZOOM_LINK",
    templateKey: "zoom_invitation",
    phone: "+17865550199",
    prospect: { preferred_language: "english", name: "Ana" },
    templateVariables: { prospect_first_name: "Ana" },
    templateButtonVariables: { meeting_url: "123456789" },
    now: NOW,
    evaluateWindow: CLOSED_WINDOW
  });
  assert.equal(auth.authorized, false);
  assert.notEqual(auth.status, "sent_template");
});

test("16-19. no live send; templates inactive; no Railway env mutation; Recruit AI OFF", () => {
  const pipelineSource = fs.readFileSync(
    path.join(__dirname, "../core/whatsappOutboundPipeline.js"),
    "utf8"
  );
  assert.match(pipelineSource, /normalizeZoomDynamicUrlButtonParameter/);
  assert.equal(process.env.WHATSAPP_APPROVED_TEMPLATES_JSON || "", "");
  assert.equal(isExecutionEnabled(), false);

  const defaultResolve = resolveApprovedTemplate({
    templateKey: "zoom_invitation",
    prospect: { preferred_language: "english" },
    variables: { prospect_first_name: "Ana" },
    buttonVariables: { meeting_url: "123456789" }
  });
  assert.equal(defaultResolve.ok, false);
});

test("20-22. BR-078 mapping regressions + missed appointment ES v2", () => {
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.zoom_invitation.english,
    "atlas_zoom_invitation_en"
  );
  assert.equal(
    CANONICAL_META_TEMPLATE_NAMES.zoom_invitation.spanish,
    "atlas_zoom_invitation_es"
  );
  assert.equal(
    getCanonicalMetaTemplateName("missed_appointment", "spanish"),
    "atlas_missed_appointment_es_v2"
  );
  assert.equal(
    getCanonicalMetaTemplateName("missed_appointment", "english"),
    "atlas_missed_appointment_en"
  );
  assert.equal(isStaleMetaTemplateName("atlas_missed_appointment_es"), true);

  const missedEs = resolveApprovedTemplate({
    templateKey: "missed_appointment",
    prospect: { preferred_language: "spanish" },
    variables: { prospect_first_name: "Maria" },
    registry: getApprovedTemplateRegistry(
      JSON.stringify({
        missed_appointment: {
          spanish: {
            metaTemplateName: "atlas_missed_appointment_es_v2",
            approved: true,
            active: true
          }
        }
      })
    )
  });
  assert.equal(missedEs.ok, true);
  assert.equal(missedEs.metaTemplateName, "atlas_missed_appointment_es_v2");

  const staleRegistry = getApprovedTemplateRegistry(
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
  assert.equal(staleRegistry.missed_appointment.locales.spanish.active, false);
  assert.equal(staleRegistry.missed_appointment.locales.spanish.metaTemplateName, null);
  const staleMissed = resolveApprovedTemplate({
    templateKey: "missed_appointment",
    prospect: { preferred_language: "spanish" },
    variables: { prospect_first_name: "Maria" },
    registry: staleRegistry
  });
  assert.equal(staleMissed.ok, false);
  assert.notEqual(staleMissed.metaTemplateName, "atlas_missed_appointment_es");
});
