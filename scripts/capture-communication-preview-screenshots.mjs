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

const interviewAtMs = Date.parse("2026-03-15T18:30:00.000Z");
const timezone = "America/New_York";
const organizationSettings = {
  organizationName: "Team Vision",
  office: {
    name: "Team Vision Office",
    fullAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    mapsUrl: "https://maps.google.com/?q=Team+Vision+Doral"
  }
};
const representative = {
  name: "Ana Rivera",
  title: "Recruiting Specialist",
  email: "ana@teamvision.com",
  repId: "4TJLK"
};

function buildPayload({ language, interviewType, zoomUrl = null }) {
  const message = composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_DETAILS, {
    language,
    prospectName: "Maria Lopez",
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
        prospectName: "Maria Lopez",
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
      name: "Maria Lopez",
      preferred_language: language === "es" ? "spanish" : "english"
    },
    representative,
    organizationSettings
  });
}

const LABELS = {
  en: {
    heading: "Outbound message preview",
    channel: "Channel",
    prospect: "Prospect",
    schedule: "Interview date & time",
    type: "Interview type",
    language: "Preferred language",
    representative: "Representative",
    title: "Title / organization",
    organization: "Organization",
    zoom: "Zoom link",
    office: "Office location",
    message: "Final message",
    back: "Back to Edit",
    copy: "Copy Message",
    send: "Send Invitation",
    missingHeading: "Missing or incomplete content",
    missingProfilePhoto: "Representative photo",
    missingOfficeLogo: "Office logo"
  },
  es: {
    heading: "Vista previa del mensaje saliente",
    channel: "Canal",
    prospect: "Prospecto",
    schedule: "Fecha y hora",
    type: "Tipo de entrevista",
    language: "Idioma preferido",
    representative: "Representante",
    title: "Título / organización",
    organization: "Organización",
    zoom: "Enlace de Zoom",
    office: "Ubicación de la oficina",
    message: "Mensaje final",
    back: "Volver a editar",
    copy: "Copiar mensaje",
    send: "Enviar invitación",
    missingHeading: "Contenido faltante o incompleto",
    missingProfilePhoto: "Foto del representante",
    missingOfficeLogo: "Logo de la oficina"
  }
};

const MISSING_LABELS = {
  profilePhoto: { en: "Representative photo", es: "Foto del representante" },
  officeLogo: { en: "Office logo", es: "Logo de la oficina" }
};

function renderHtml(payload, locale) {
  const labels = LABELS[locale];
  const schedule = payload.interview?.schedule;
  const scheduleLabel = schedule
    ? `${schedule.dateLine} · ${schedule.timeLine} (${schedule.timezoneLabel})`
    : "—";
  const locationLabel = payload.location?.type === "zoom" ? labels.zoom : labels.office;
  const locationValue =
    payload.location?.type === "zoom" ? payload.location?.zoomUrl : payload.location?.fullAddress;

  const missingItems = (payload.missingContent || [])
    .filter((item) => ["profilePhoto", "officeLogo"].includes(item.key))
    .map(
      (item) => `<li class="communication-preview__missing-item">${MISSING_LABELS[item.key]?.[locale] || item.key}</li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${css}</style>
</head>
<body>
  <div class="page">
    <div class="communication-preview">
      <header class="communication-preview__header">
        <p class="communication-preview__eyebrow">${labels.heading}</p>
        <p class="communication-preview__channel">${labels.channel}: ${payload.channel} · ${payload.deliveryMode}</p>
      </header>
      ${
        missingItems
          ? `<div class="communication-preview__missing"><p class="communication-preview__missing-title">${labels.missingHeading}</p><ul class="communication-preview__missing-list">${missingItems}</ul></div>`
          : ""
      }
      <section class="communication-preview__meta">
        <dl class="communication-preview__meta-grid">
          <div class="communication-preview__meta-row"><dt>${labels.prospect}</dt><dd>${payload.prospectName}</dd></div>
          <div class="communication-preview__meta-row"><dt>${labels.schedule}</dt><dd>${scheduleLabel}</dd></div>
          <div class="communication-preview__meta-row"><dt>${labels.type}</dt><dd>${payload.interview?.typeLabel}</dd></div>
          <div class="communication-preview__meta-row"><dt>${labels.language}</dt><dd>${payload.languageLabel}</dd></div>
          <div class="communication-preview__meta-row"><dt>${labels.representative}</dt><dd>${payload.representative?.name}</dd></div>
          <div class="communication-preview__meta-row"><dt>${labels.title}</dt><dd>${payload.representative?.title}</dd></div>
          <div class="communication-preview__meta-row"><dt>${labels.organization}</dt><dd>${payload.representative?.organization}</dd></div>
          <div class="communication-preview__meta-row"><dt>${locationLabel}</dt><dd>${locationValue || "—"}</dd></div>
        </dl>
      </section>
      <section class="communication-preview__message">
        <h3 class="communication-preview__message-title">${labels.message}</h3>
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
  },
  {
    filename: "communication-preview-en-in-person.png",
    locale: "en",
    payload: buildPayload({
      language: "en",
      interviewType: "office"
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
