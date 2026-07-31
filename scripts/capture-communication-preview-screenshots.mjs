/**
 * Renders Communication Preview with real outbound payloads and captures PNGs.
 * Run: node scripts/capture-communication-preview-screenshots.mjs
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const { composeWhatsAppMessage, WHATSAPP_TEMPLATES } = require(
  path.join(root, "backend/core/whatsappCommunicationEngine.js")
);
const { buildOutboundCommunicationPayload } = require(
  path.join(root, "backend/core/communicationOutboundPayloadEngine.js")
);

const interviewAtMs = Date.parse("2026-07-31T15:00:00.000Z");
const timezone = "America/New_York";
const organizationSettings = {
  organizationName: "Team Vision Financial",
  office: {
    name: "Team Vision Office",
    fullAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    mapsUrl: "https://maps.google.com/?q=Team+Vision+Doral"
  }
};
const representative = {
  name: "Niovel Perez",
  title: "Recruiting Specialist",
  email: "niovel@teamvision.com",
  repId: "4TJLK"
};

function buildPayload({ language, interviewType, zoomUrl = null }) {
  const message = composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language,
    prospectName: "Abraham Manuel",
    recruiterName: representative.name,
    interviewAtMs,
    timezone,
    zoomUrl,
    interviewType,
    organizationName: organizationSettings.organizationName,
    office: organizationSettings.office
  });

  return buildOutboundCommunicationPayload({
    built: {
      template: WHATSAPP_TEMPLATES.INTERVIEW_DETAILS,
      message,
      language,
      phone: "+15555550100",
      zoomUrl,
      context: {
        prospectName: "Abraham Manuel",
        recruiterName: representative.name,
        interviewAtMs,
        timezone,
        interviewType,
        organizationName: organizationSettings.organizationName,
        office: organizationSettings.office,
        language,
        zoomUrl
      }
    },
    prospect: {
      name: "Abraham Manuel",
      preferred_language: language === "es" ? "spanish" : "english"
    },
    representative,
    organizationSettings
  });
}

const LABELS = {
  en: {
    subtitle: "Review your invitation before sending.",
    delivery: "Delivery",
    whatsapp: "WhatsApp",
    representative: "Representative",
    message: "Final message",
    back: "Back to Edit",
    copy: "Copy",
    send: "Send Invitation",
    recommendedHeading: "Recommended enhancements",
    missingProfilePhoto: "Representative photo",
    missingOfficeLogo: "Office logo",
    missingTitle: "Representative title"
  },
  es: {
    subtitle: "Revisa la invitación antes de enviarla.",
    delivery: "Entrega",
    whatsapp: "WhatsApp",
    representative: "Representante",
    message: "Mensaje final",
    back: "Volver a editar",
    copy: "Copiar",
    send: "Enviar invitación",
    recommendedHeading: "Mejoras recomendadas",
    missingProfilePhoto: "Foto del representante",
    missingOfficeLogo: "Logo de la oficina",
    missingTitle: "Título del representante"
  }
};

const MISSING_LABELS = {
  profilePhoto: { en: "Representative photo", es: "Foto del representante" },
  officeLogo: { en: "Office logo", es: "Logo de la oficina" },
  representativeTitle: { en: "Representative title", es: "Título del representante" }
};

function renderHtml(payload, locale) {
  const labels = LABELS[locale];
  const schedule = payload.interview?.schedule;
  const recommendedItems = (payload.missingContent || [])
    .filter((item) => item.severity === "recommended")
    .map(
      (item) =>
        `<li class="communication-preview__validation-item communication-preview__validation-item--recommended">${MISSING_LABELS[item.key]?.[locale] || item.key}</li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${locale === "es" ? "Invitación a entrevista" : "Interview Invitation"}</title>
  <style>${css}</style>
</head>
<body>
  <div class="page">
    <h1 class="page-title">${locale === "es" ? "Invitación a entrevista" : "Interview Invitation"}</h1>
    <div class="communication-preview">
      <header class="communication-preview__header">
        <p class="communication-preview__subtitle">${labels.subtitle}</p>
      </header>
      <section class="communication-preview__delivery">
        <h3 class="communication-preview__section-label">${labels.delivery}</h3>
        <ul class="communication-preview__delivery-channels">
          <li class="communication-preview__delivery-channel communication-preview__delivery-channel--active">${labels.whatsapp}</li>
        </ul>
      </section>
      ${
        recommendedItems
          ? `<div class="communication-preview__validation communication-preview__validation--recommended"><p class="communication-preview__validation-title">${labels.recommendedHeading}</p><ul class="communication-preview__validation-list">${recommendedItems}</ul></div>`
          : ""
      }
      <section class="communication-preview__summary">
        <p class="communication-preview__prospect-name">${payload.prospectName}</p>
        ${
          schedule
            ? `<div class="communication-preview__schedule"><p>${schedule.dateLine}</p><p>${schedule.timeLine} (${schedule.timezoneAbbreviation})</p></div>`
            : ""
        }
        <div class="communication-preview__summary-meta">
          <p>${payload.interview?.typeLabel}</p>
          <p>${payload.languageLabel}</p>
        </div>
        <div class="communication-preview__representative">
          <p class="communication-preview__section-label">${labels.representative}</p>
          <p class="communication-preview__representative-name">${payload.representative?.name}</p>
          ${payload.representative?.title ? `<p class="communication-preview__representative-title">${payload.representative.title}</p>` : ""}
        </div>
      </section>
      <section class="communication-preview__message">
        <h3 class="communication-preview__section-label">${labels.message}</h3>
        <pre class="communication-preview__message-body">${escapeHtml(payload.message)}</pre>
      </section>
      <footer class="communication-preview__actions">
        <button type="button" class="btn btn-ghost">${labels.back}</button>
        <button type="button" class="btn btn-secondary">${labels.copy}</button>
        <button type="button" class="btn btn-primary">${labels.send}</button>
      </footer>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const css = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #eef2f7;
    color: #0f172a;
  }
  .page {
    max-width: 760px;
    margin: 24px auto;
    padding: 20px;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }
  .page-title {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 700;
  }
  .btn {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 600;
    background: #fff;
    color: #0f172a;
  }
  .btn-primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  .btn-secondary { background: #f8fafc; }
  .btn-ghost { background: transparent; border-color: transparent; color: #475569; }
  ${await readFile(path.join(root, "frontend/src/components/communication/CommunicationPreview.css"), "utf8")}
`;

const scenarios = [
  {
    filename: "communication-preview-en-zoom.png",
    locale: "en",
    payload: buildPayload({
      language: "en",
      interviewType: "zoom",
      zoomUrl: "https://zoom.us/j/123456789"
    })
  },
  {
    filename: "communication-preview-es-zoom.png",
    locale: "es",
    payload: buildPayload({
      language: "es",
      interviewType: "zoom",
      zoomUrl: "https://zoom.us/j/123456789"
    })
  }
];

const outputDir = path.join(root, "docs/assets/communication-preview");
await mkdir(outputDir, { recursive: true });

const chromePaths = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
];

const chromePath = chromePaths.find((candidate) => {
  try {
    execSync(`test -x "${candidate}"`);
    return true;
  } catch {
    return false;
  }
});

if (!chromePath) {
  throw new Error("Headless Chrome not found. Install Google Chrome to capture preview screenshots.");
}

for (const scenario of scenarios) {
  const html = renderHtml(scenario.payload, scenario.locale);
  const baseName = scenario.filename.replace(".png", "");
  const htmlPath = path.join(outputDir, `${baseName}.html`);
  const pngPath = path.join(outputDir, scenario.filename);
  await writeFile(htmlPath, html, "utf8");

  execSync(
    `"${chromePath}" --headless=new --disable-gpu --window-size=420,1200 --screenshot="${pngPath}" "file://${htmlPath}"`,
    { stdio: "inherit" }
  );

  console.log(`Captured ${scenario.filename}`);
}

console.log(`Screenshots saved to ${outputDir}`);
