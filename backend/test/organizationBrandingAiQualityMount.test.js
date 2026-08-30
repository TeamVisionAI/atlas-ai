/**
 * Regression: BR-175 AI Quality org-admin gate must not capture sibling
 * /api/organization routes. Unscoped router.use(requireOrgAdmin) 403s
 * GET /branding for normal tenant users, so the authenticated shell stays Atlas.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const http = require("node:http");
const { SAAS_ROLES } = require("../security/saasRoles");
const organizationAiQualityRoutes = require("../routes/organizationAiQuality");

const ORG_ID = "org-tenant-a";

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function tenantApp(saasRole) {
  const app = express();
  app.use("/api/organization", (req, res, next) => {
    req.authContext = {
      userId: "user-1",
      saasRole,
      organizationId: ORG_ID
    };
    req.tenantContext = { organizationId: ORG_ID, userId: "user-1" };
    req.controlPlaneOnly = false;
    next();
  });
  app.use("/api/organization", organizationAiQualityRoutes);
  app.get("/api/organization/branding", (req, res) => {
    res.json({ name: "Acme Recruiting", controlPlane: false });
  });
  app.get("/api/organization/notifications", (req, res) => {
    res.json({ notifications: [], unreadCount: 0 });
  });
  return app;
}

test("AI Quality org-admin middleware is per-route, not router-wide", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../routes/organizationAiQuality.js"),
    "utf8"
  );
  assert.doesNotMatch(src, /router\.use\(requireOrgAdmin\)/);
  assert.doesNotMatch(src, /router\.use\(requireAtlasUser\)/);
  assert.match(src, /router\.get\("\/ai-quality\/settings", requireOrgAdmin/);
});

test("recruiter can read branding and notifications when AI Quality router is mounted first", async () => {
  const { server, port } = await listen(tenantApp(SAAS_ROLES.REPRESENTATIVE));
  try {
    const branding = await fetch(`http://127.0.0.1:${port}/api/organization/branding`);
    const brandingBody = await branding.json();
    assert.equal(branding.status, 200);
    assert.equal(brandingBody.name, "Acme Recruiting");

    const notifications = await fetch(
      `http://127.0.0.1:${port}/api/organization/notifications`
    );
    assert.equal(notifications.status, 200);

    const aiQuality = await fetch(
      `http://127.0.0.1:${port}/api/organization/ai-quality/settings`
    );
    const aiQualityBody = await aiQuality.json();
    assert.equal(aiQuality.status, 403);
    assert.equal(aiQualityBody.error, "FORBIDDEN");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
