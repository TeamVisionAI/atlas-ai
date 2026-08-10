/**
 * Minimal mobile-first phone-bind interstitial HTML (Phase 1).
 * Not a recruiting form — phone only.
 */

const { NATURAL_WHATSAPP_PREFILL } = require("./constants");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPhoneBindInterstitial({
  token,
  scanId,
  bindMac,
  campaignName = "Team Vision",
  errorMessage = null
}) {
  const title = "Continuar por WhatsApp";
  const err = errorMessage
    ? `<p class="err" role="alert">${escapeHtml(errorMessage)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #0f1c17;
      --card: #16261f;
      --text: #f3f7f4;
      --muted: #a8b5ae;
      --accent: #2f9e6b;
      --accent-press: #27855a;
      --err: #f0a5a0;
      --border: #2a3d34;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background:
        radial-gradient(1200px 600px at 20% -10%, #1d3a2c 0%, transparent 55%),
        var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    main {
      width: 100%;
      max-width: 420px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px 22px 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.35rem;
      font-weight: 650;
      letter-spacing: -0.02em;
    }
    p.lead {
      margin: 0 0 22px;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.45;
    }
    label {
      display: block;
      font-size: 0.85rem;
      margin-bottom: 8px;
      color: var(--muted);
    }
    input[type="tel"] {
      width: 100%;
      padding: 14px 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #101a16;
      color: var(--text);
      font-size: 1.05rem;
      margin-bottom: 16px;
    }
    input[type="tel"]:focus {
      outline: 2px solid rgba(47, 158, 107, 0.55);
      border-color: var(--accent);
    }
    button {
      width: 100%;
      border: 0;
      border-radius: 10px;
      padding: 14px 16px;
      background: var(--accent);
      color: #04140c;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
    }
    button:active { background: var(--accent-press); }
    .brand {
      margin-top: 18px;
      text-align: center;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .err {
      color: var(--err);
      font-size: 0.9rem;
      margin: 0 0 14px;
    }
    .hint {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 0.75rem;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">Usa tu número de WhatsApp para continuar. No pedimos más datos aquí.</p>
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
    <p class="hint">Al continuar abrirás WhatsApp con un mensaje listo para enviar.</p>
    <p class="brand">${escapeHtml(campaignName)} · Atlas</p>
  </main>
</body>
</html>`;
}

function renderSafeErrorPage({ title = "Enlace no disponible", body = "Este enlace no está disponible." } = {}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0; min-height: 100vh; display:flex; align-items:center; justify-content:center;
      font-family: system-ui, sans-serif; background:#0f1c17; color:#f3f7f4; padding:24px;
    }
    main { max-width: 420px; text-align:center; }
    h1 { font-size: 1.25rem; margin-bottom: 8px; }
    p { color:#a8b5ae; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
  </main>
</body>
</html>`;
}

module.exports = {
  renderPhoneBindInterstitial,
  renderSafeErrorPage,
  NATURAL_WHATSAPP_PREFILL
};
