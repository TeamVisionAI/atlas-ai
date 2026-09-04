/**
 * QR interstitial branding polish — presentation-only assertions.
 * Does not exercise bind/attribution logic (covered by Phase 1/2).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  renderPhoneBindInterstitial,
  renderSafeErrorPage
} = require("../core/qrChannel/interstitialHtml");
const {
  DEFAULT_QR_INTERSTITIAL_BRANDING,
  resolveQrInterstitialBranding
} = require("../core/qrChannel/qrInterstitialBranding");

const APPROVED_LEAD =
  "Ingresa tu número de WhatsApp para continuar. Te llevaremos directamente a WhatsApp con un mensaje listo para enviar.";

test("branding tokens: navy/gold defaults; tenant-ready override shape", () => {
  const branding = resolveQrInterstitialBranding();
  assert.equal(branding.organizationDisplayName, "Atlas");
  const tv = resolveQrInterstitialBranding({
    organizationId: "00000000-0000-4000-8000-000000000001"
  });
  assert.equal(tv.organizationDisplayName, "Team Vision");
  assert.equal(branding.productName, "Atlas");
  assert.equal(branding.colors.background, "#0b1220");
  assert.equal(branding.colors.accent, "#e0b84c");
  assert.notEqual(branding.colors.accent, "#2f9e6b");
  assert.notEqual(branding.colors.background, "#0f1c17");

  const custom = resolveQrInterstitialBranding({
    organizationDisplayName: "Acme Recruiting",
    colors: { accent: "#abcdef" }
  });
  assert.equal(custom.organizationDisplayName, "Acme Recruiting");
  assert.equal(custom.colors.accent, "#abcdef");
  assert.equal(custom.colors.background, DEFAULT_QR_INTERSTITIAL_BRANDING.colors.background);
});

test("interstitial copy matches approved Spanish structure", () => {
  const html = renderPhoneBindInterstitial({
    token: "tok_example",
    scanId: "11111111-1111-4111-8111-111111111111",
    bindMac: "mac_example"
  });

  assert.match(html, /<title>Continuar por WhatsApp<\/title>/);
  assert.match(html, /<h1>Continuar por WhatsApp<\/h1>/);
  assert.match(html, new RegExp(APPROVED_LEAD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /¿Cuál es tu número de WhatsApp\?/);
  assert.match(html, /<button type="submit">Continuar por WhatsApp<\/button>/);
  assert.match(html, /Atlas · Atlas/);
  assert.doesNotMatch(html, /Usa tu número de WhatsApp para continuar/);
  assert.doesNotMatch(html, /No pedimos más datos aquí/);
});

test("interstitial keeps bind contract unchanged (form/fields)", () => {
  const html = renderPhoneBindInterstitial({
    token: "tok_abc",
    scanId: "22222222-2222-4222-8222-222222222222",
    bindMac: "mac_abc"
  });

  assert.match(html, /method="POST"/);
  assert.match(html, /action="\/go\/tok_abc\/bind"/);
  assert.match(html, /name="scanId" value="22222222-2222-4222-8222-222222222222"/);
  assert.match(html, /name="bindMac" value="mac_abc"/);
  assert.match(html, /id="phone"/);
  assert.match(html, /name="phone"/);
  assert.match(html, /type="tel"/);
  assert.match(html, /placeholder="\+1 \(305\) 555-0123"/);
  assert.match(html, /maxlength="32"/);
  assert.match(html, /required/);
});

test("Team Vision navy/gold presentation; dominant WhatsApp green removed", () => {
  const html = renderPhoneBindInterstitial({
    token: "tok",
    scanId: "33333333-3333-4333-8333-333333333333",
    bindMac: "mac"
  });

  assert.match(html, /--qi-bg:\s*#0b1220/);
  assert.match(html, /--qi-accent:\s*#e0b84c/);
  assert.match(html, /--qi-text:\s*#f8fafc/);
  assert.doesNotMatch(html, /#2f9e6b/);
  assert.doesNotMatch(html, /#27855a/);
  assert.doesNotMatch(html, /#0f1c17/);
  assert.doesNotMatch(html, /background:\s*var\(--accent\)/);
});

test("error page uses same branding family", () => {
  const html = renderSafeErrorPage({
    title: "Enlace inactivo",
    body: "Este código QR ya no está activo."
  });
  assert.match(html, /--qi-bg:\s*#0b1220/);
  assert.match(html, /Atlas · Atlas/);
  assert.doesNotMatch(html, /#2f9e6b/);
});

test("execution gates remain OFF", () => {
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
  assert.notEqual(process.env.RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED, "true");
});
