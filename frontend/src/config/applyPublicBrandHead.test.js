import test from "node:test";
import assert from "node:assert/strict";
import { ATLAS_BRAND_ASSETS, TEAM_VISION_BRAND_ASSETS } from "./publicBrandAssets.js";
import { usesAtlasPlatformAssets } from "./applyPublicBrandHead.js";

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
