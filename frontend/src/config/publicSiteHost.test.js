import test from "node:test";
import assert from "node:assert/strict";
import {
  ATLAS_APP_LOGIN_URL,
  PUBLIC_SITE_BRAND,
  getAtlasAppLoginUrl,
  isAtlasAppHost,
  isAtlasMarketingHost,
  isTeamVisionMarketingHost,
  resolvePublicRootDecision,
  resolvePublicSiteBrand
} from "./publicSiteHost.js";

test("useatlas-ai.com resolves to Atlas marketing brand", () => {
  assert.equal(resolvePublicSiteBrand("useatlas-ai.com"), PUBLIC_SITE_BRAND.ATLAS);
  assert.equal(resolvePublicSiteBrand("www.useatlas-ai.com"), PUBLIC_SITE_BRAND.ATLAS);
  assert.equal(isAtlasMarketingHost("useatlas-ai.com"), true);
});

test("app.useatlas-ai.com resolves to app brand", () => {
  assert.equal(resolvePublicSiteBrand("app.useatlas-ai.com"), PUBLIC_SITE_BRAND.APP);
  assert.equal(isAtlasAppHost("app.useatlas-ai.com"), true);
  assert.equal(isAtlasMarketingHost("app.useatlas-ai.com"), false);
});

test("teamvisionfinancial.com resolves to Team Vision marketing", () => {
  assert.equal(
    resolvePublicSiteBrand("teamvisionfinancial.com"),
    PUBLIC_SITE_BRAND.TEAM_VISION
  );
  assert.equal(
    resolvePublicSiteBrand("www.teamvisionfinancial.com"),
    PUBLIC_SITE_BRAND.TEAM_VISION
  );
  assert.equal(isTeamVisionMarketingHost("teamvisionfinancial.com"), true);
});

test("localhost defaults to Team Vision marketing for local / root", () => {
  assert.equal(resolvePublicSiteBrand("localhost"), PUBLIC_SITE_BRAND.TEAM_VISION);
  assert.equal(resolvePublicSiteBrand("127.0.0.1"), PUBLIC_SITE_BRAND.TEAM_VISION);
});

test("Vercel preview hosts keep Team Vision marketing root", () => {
  assert.equal(
    resolvePublicSiteBrand("atlas-ai-abc123.vercel.app"),
    PUBLIC_SITE_BRAND.TEAM_VISION
  );
});

test("Atlas app login CTA is absolute app host URL", () => {
  assert.equal(getAtlasAppLoginUrl(), ATLAS_APP_LOGIN_URL);
  assert.match(ATLAS_APP_LOGIN_URL, /^https:\/\/app\.useatlas-ai\.com\/app\/login$/);
});

test("public root decision: Atlas marketing → atlas home", () => {
  assert.deepEqual(resolvePublicRootDecision("useatlas-ai.com"), { kind: "atlas_home" });
});

test("public root decision: app host → login redirect (not Team Vision marketing)", () => {
  assert.deepEqual(resolvePublicRootDecision("app.useatlas-ai.com"), {
    kind: "redirect",
    to: "/app/login"
  });
});

test("public root decision: Team Vision host → Team Vision home", () => {
  assert.deepEqual(resolvePublicRootDecision("teamvisionfinancial.com"), {
    kind: "team_vision_home"
  });
});
