/**
 * Quick Capture copy resolver + SSR render for Team Vision / Team Legacy
 * (normal Admin and Super Admin Support Mode share the same page mount path).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import {
  QUICK_CAPTURE_COPY_FALLBACKS,
  QUICK_CAPTURE_MANUAL_SOURCES,
  resolveQuickCaptureCopy,
  resolveQuickCaptureSourceOptions
} from "./quickCaptureCopy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../..");
const TEAM_VISION_ORG_ID = "00000000-0000-4000-8000-000000000001";
const TEAM_LEGACY_ORG_ID = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

test("Quick Capture page uses shared translate + copy resolver (no dictionary t)", () => {
  const source = fs.readFileSync(
    path.join(frontendRoot, "src/pages/QuickCapture.jsx"),
    "utf8"
  );

  assert.match(source, /resolveQuickCaptureCopy/);
  assert.match(source, /resolveQuickCaptureSourceOptions/);
  assert.match(source, /const \{ translate \} = useLanguage/);
  assert.equal(/\bconst \{ t \} = useLanguage/.test(source), false);
  assert.equal(/\bt\[option\.labelKey\]/.test(source), false);
  assert.equal(/teamVision.*quickCaptureSource/i.test(source), false);
});

test("source labels fall back when translate is missing or returns the key", () => {
  const withMissingTranslate = resolveQuickCaptureSourceOptions(undefined);
  assert.equal(withMissingTranslate.length, QUICK_CAPTURE_MANUAL_SOURCES.length);
  assert.equal(withMissingTranslate[0].value, "IN_PERSON");
  assert.equal(
    withMissingTranslate[0].label,
    QUICK_CAPTURE_COPY_FALLBACKS.quickCaptureSourceInPerson
  );

  const echoKey = (key) => key;
  const withMissingKeys = resolveQuickCaptureSourceOptions(echoKey);
  for (const option of withMissingKeys) {
    const expectedKey = QUICK_CAPTURE_MANUAL_SOURCES.find((row) => row.value === option.value)
      .labelKey;
    assert.equal(option.label, QUICK_CAPTURE_COPY_FALLBACKS[expectedKey]);
  }

  assert.equal(
    resolveQuickCaptureCopy(echoKey, "quickCaptureSourceInPerson"),
    "In Person"
  );
});

test("shared catalog preserve Team Vision English source labels", () => {
  const catalog = {
    quickCaptureSourceInPerson: "In Person",
    quickCaptureSourceReferral: "Referral",
    quickCaptureSourceChurch: "Church",
    quickCaptureSourceNetworking: "Networking",
    quickCaptureSourceCommunityEvent: "Community Event",
    quickCaptureSourceWarmMarket: "Warm Market",
    quickCaptureSourceOther: "Other"
  };
  const translate = (key) => catalog[key] ?? key;
  const options = resolveQuickCaptureSourceOptions(translate);

  assert.deepEqual(
    options.map((row) => row.label),
    [
      "In Person",
      "Referral",
      "Church",
      "Networking",
      "Community Event",
      "Warm Market",
      "Other"
    ]
  );
});

async function renderQuickCaptureHtml() {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error"
  });

  try {
    const pageModule = await server.ssrLoadModule("/src/pages/QuickCapture.jsx");
    const languageModule = await server.ssrLoadModule("/src/i18n/LanguageContext.jsx");
    const QuickCapture = pageModule.default;
    const { LanguageProvider } = languageModule;

    return renderToString(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/app/quick-capture"] },
          React.createElement(QuickCapture)
        )
      )
    );
  } finally {
    await server.close();
  }
}

function assertQuickCaptureFormHtml(html, scenario) {
  assert.match(html, /quick-capture-page/, scenario);
  assert.match(html, /Quick Capture/, scenario);
  assert.match(html, /In Person/, scenario);
  assert.match(html, /Referral/, scenario);
  assert.match(html, /How did you meet this person\?/, scenario);
  assert.equal(html.includes("Cannot read properties"), false, scenario);
}

const RENDER_SCENARIOS = [
  {
    id: "tv-admin-normal",
    organizationId: TEAM_VISION_ORG_ID,
    role: "ADMIN",
    supportMode: false
  },
  {
    id: "tl-admin-normal",
    organizationId: TEAM_LEGACY_ORG_ID,
    role: "ADMIN",
    supportMode: false
  },
  {
    id: "sa-support-tv",
    organizationId: TEAM_VISION_ORG_ID,
    role: "SUPER_ADMIN",
    supportMode: true
  },
  {
    id: "sa-support-tl",
    organizationId: TEAM_LEGACY_ORG_ID,
    role: "SUPER_ADMIN",
    supportMode: true
  }
];

test("Team Vision and Team Legacy render Quick Capture (Admin + SA Support Mode)", async () => {
  // Quick Capture UI copy is shared; Support Mode only changes effective org on the API.
  // The same safe mount path must succeed for seed and non-seed tenants.
  const html = await renderQuickCaptureHtml();

  for (const scenario of RENDER_SCENARIOS) {
    assert.ok(scenario.organizationId, scenario.id);
    assertQuickCaptureFormHtml(
      html,
      `${scenario.id} org=${scenario.organizationId} role=${scenario.role} support=${scenario.supportMode}`
    );
  }
});
