/**
 * Minimal mobile-first phone-bind interstitial HTML (Phase 1).
 * Not a recruiting form — phone only.
 * Presentation: Team Vision / Atlas navy + gold (see qrInterstitialBranding.js).
 */

const { NATURAL_WHATSAPP_PREFILL } = require("./constants");
const {
  resolveQrInterstitialBranding,
  brandingCssVariables
} = require("./qrInterstitialBranding");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sharedPublicPageStyles(branding) {
  return `
    :root {
      ${brandingCssVariables(branding)}
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(900px 480px at 18% -8%, var(--qi-bg-glow) 0%, transparent 58%),
        var(--qi-bg);
      color: var(--qi-text);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(20px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
      -webkit-text-size-adjust: 100%;
    }
    main {
      width: 100%;
      max-width: 400px;
      background: var(--qi-surface);
      border: 1px solid var(--qi-border);
      border-radius: 18px;
      padding: 28px 22px 22px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.375rem;
      font-weight: 650;
      letter-spacing: -0.025em;
      line-height: 1.25;
      color: var(--qi-text);
    }
    p.lead {
      margin: 0 0 22px;
      color: var(--qi-muted);
      font-size: 0.95rem;
      line-height: 1.5;
    }
    label {
      display: block;
      font-size: 0.875rem;
      margin-bottom: 8px;
      color: var(--qi-text);
      font-weight: 500;
    }
    input[type="tel"] {
      width: 100%;
      padding: 14px 14px;
      border-radius: 12px;
      border: 1px solid var(--qi-border);
      background: var(--qi-input-bg);
      color: var(--qi-text);
      font-size: 1.05rem;
      margin-bottom: 16px;
      -webkit-appearance: none;
      appearance: none;
    }
    input[type="tel"]::placeholder {
      color: #64748b;
    }
    input[type="tel"]:focus {
      outline: 2px solid var(--qi-focus);
      outline-offset: 1px;
      border-color: var(--qi-accent);
    }
    button[type="submit"] {
      width: 100%;
      border: 0;
      border-radius: 12px;
      padding: 15px 16px;
      min-height: 52px;
      background: var(--qi-accent);
      color: var(--qi-accent-contrast);
      font-weight: 700;
      font-size: 1.02rem;
      letter-spacing: -0.01em;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    button[type="submit"]:hover {
      background: var(--qi-accent-press);
    }
    button[type="submit"]:active {
      background: var(--qi-accent-press);
      transform: translateY(1px);
    }
    button[type="submit"]:focus-visible {
      outline: 2px solid var(--qi-focus);
      outline-offset: 3px;
    }
    .brand {
      margin-top: 20px;
      text-align: center;
      color: var(--qi-muted);
      font-size: 0.8rem;
      letter-spacing: 0.02em;
    }
    .err {
      color: var(--qi-err);
      font-size: 0.9rem;
      margin: 0 0 14px;
      line-height: 1.4;
    }
  `;
}

function renderPhoneBindInterstitial({
  token,
  scanId,
  bindMac,
  campaignName,
  errorMessage = null,
  branding: brandingOverrides = null
}) {
  const branding = resolveQrInterstitialBranding(brandingOverrides || {});
  const orgName = campaignName || branding.organizationDisplayName;
  const title = "Continuar por WhatsApp";
  const lead =
    "Ingresa tu número de WhatsApp para continuar. Te llevaremos directamente a WhatsApp con un mensaje listo para enviar.";
  const err = errorMessage
    ? `<p class="err" role="alert">${escapeHtml(errorMessage)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="theme-color" content="${escapeHtml(branding.colors.background)}" />
  <title>${escapeHtml(title)}</title>
  <style>
${sharedPublicPageStyles(branding)}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">${escapeHtml(lead)}</p>
    ${err}
    <form method="POST" action="/go/${escapeHtml(token)}/bind" autocomplete="tel">
      <input type="hidden" name="scanId" value="${escapeHtml(scanId)}" />
      <input type="hidden" name="bindMac" value="${escapeHtml(bindMac)}" />
      <label for="phone">¿Cuál es tu número de WhatsApp?</label>
      <input
        id="phone"
        name="phone"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        required
        placeholder="+1 (305) 555-0123"
        maxlength="32"
      />
      <button type="submit">Continuar por WhatsApp</button>
    </form>
    <p class="brand">${escapeHtml(orgName)} · ${escapeHtml(branding.productName)}</p>
  </main>
</body>
</html>`;
}

function renderSafeErrorPage({
  title = "Enlace no disponible",
  body = "Este enlace no está disponible.",
  branding: brandingOverrides = null
} = {}) {
  const branding = resolveQrInterstitialBranding(brandingOverrides || {});
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="theme-color" content="${escapeHtml(branding.colors.background)}" />
  <title>${escapeHtml(title)}</title>
  <style>
${sharedPublicPageStyles(branding)}
    main { text-align: center; padding-bottom: 28px; }
    p.lead { margin-bottom: 0; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">${escapeHtml(body)}</p>
    <p class="brand">${escapeHtml(branding.organizationDisplayName)} · ${escapeHtml(branding.productName)}</p>
  </main>
</body>
</html>`;
}

module.exports = {
  renderPhoneBindInterstitial,
  renderSafeErrorPage,
  NATURAL_WHATSAPP_PREFILL
};
