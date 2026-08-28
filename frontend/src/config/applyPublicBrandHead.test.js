import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATLAS_BRAND_ASSETS, TEAM_VISION_BRAND_ASSETS } from "./publicBrandAssets.js";
import { usesAtlasPlatformAssets } from "./applyPublicBrandHead.js";

const repoFrontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const atlasHome = fs.readFileSync(path.join(repoFrontend, "src/pages/AtlasPublicHome.jsx"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoFrontend, "index.html"), "utf8");
const collapsedHome = atlasHome.replace(/\s+/g, " ");

test("Atlas brand asset paths are under /brand or root logo", () => {
  assert.equal(ATLAS_BRAND_ASSETS.logo, "/atlas-ai-logo.png");
  assert.equal(ATLAS_BRAND_ASSETS.faviconIco, "/brand/favicon.ico");
  assert.equal(ATLAS_BRAND_ASSETS.favicon16, "/brand/favicon-16x16.png");
  assert.equal(ATLAS_BRAND_ASSETS.favicon32, "/brand/favicon-32x32.png");
  assert.equal(ATLAS_BRAND_ASSETS.appleTouchIcon, "/brand/apple-touch-icon.png");
  assert.equal(ATLAS_BRAND_ASSETS.ogImage, "/brand/og-atlas-ai.png");
  assert.equal(ATLAS_BRAND_ASSETS.manifest, "/brand/site.webmanifest");
  assert.equal(ATLAS_BRAND_ASSETS.logoMark64, "/brand/atlas-ai-mark-64.png");
  assert.equal(ATLAS_BRAND_ASSETS.logoMark96, "/brand/atlas-ai-mark-96.png");
});

test("Team Vision keeps separate SVG favicon path", () => {
  assert.equal(TEAM_VISION_BRAND_ASSETS.faviconSvg, "/favicon.svg");
  assert.notEqual(TEAM_VISION_BRAND_ASSETS.faviconSvg, ATLAS_BRAND_ASSETS.faviconIco);
});

test("Atlas platform assets apply on Atlas marketing and app hosts only", () => {
  assert.equal(usesAtlasPlatformAssets("useatlas-ai.com"), true);
  assert.equal(usesAtlasPlatformAssets("www.useatlas-ai.com"), true);
  assert.equal(usesAtlasPlatformAssets("app.useatlas-ai.com"), true);
  assert.equal(usesAtlasPlatformAssets("teamvisionfinancial.com"), false);
  assert.equal(usesAtlasPlatformAssets("www.teamvisionfinancial.com"), false);
  assert.equal(usesAtlasPlatformAssets("localhost"), false);
});

test("useatlas-ai.com homepage H1 is exactly Atlas AI", () => {
  assert.match(atlasHome, /<h1 id="atlas-home-heading"[^>]*>\s*Atlas AI\s*<\/h1>/);
  assert.doesNotMatch(
    atlasHome,
    /<h1 id="atlas-home-heading"[\s\S]*Connect • Automate • Grow[\s\S]*<\/h1>/
  );
});

test("useatlas-ai.com homepage states Atlas AI purpose in plain language", () => {
  assert.match(
    collapsedHome,
    /Atlas AI is a business operations platform that helps insurance organizations manage prospects, recruiting conversations, appointments, follow-ups, and calendar scheduling/
  );
  assert.match(
    indexHtml,
    /Atlas AI is a business operations platform that helps insurance organizations manage prospects, recruiting conversations, appointments, follow-ups, and calendar scheduling/
  );
});
