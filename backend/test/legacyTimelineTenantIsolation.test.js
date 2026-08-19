/**
 * P0 — Legacy GET /timeline/:phone tenant isolation.
 */

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "+13055550199";

const serverJs = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const routeJs = fs.readFileSync(path.join(__dirname, "../routes/timeline.js"), "utf8");
const serviceJs = fs.readFileSync(path.join(__dirname, "../services/timelineService.js"), "utf8");

const timelineService = require("../services/timelineService");
const { organizationGuard } = require("../middleware/organizationGuard");
const { SAAS_ROLES } = require("../security/saasRoles");

function createMockConversationLogClient(rows = []) {
  const filters = {};

  const builder = {
    select() {
      return builder;
    },
    eq(column, value) {
      filters[column] = value;
      return builder;
    },
    order() {
      const data = rows.filter((row) => {
        if (filters.prospect_phone && row.prospect_phone !== filters.prospect_phone) {
          return false;
        }
        if (filters.organization_id && row.organization_id !== filters.organization_id) {
          return false;
        }
        return true;
      });
      return Promise.resolve({ data, error: null });
    }
  };

  return {
    from(table) {
      assert.equal(table, "conversation_logs");
      Object.keys(filters).forEach((key) => delete filters[key]);
      return builder;
    }
  };
}

function loadTimelineRouter() {
  const routePath = require.resolve("../routes/timeline");
  delete require.cache[routePath];
  return require("../routes/timeline");
}

function createTimelineTestApp({ authContext, query = {} }) {
  const app = express();
  app.use((req, res, next) => {
    req.query = { ...query, ...req.query };
    next();
  });
  app.use((req, res, next) => {
    if (!authContext) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }
    req.authContext = authContext;
    next();
  });
  app.use(organizationGuard({ allowSuperAdminCrossOrg: false }));
  app.use("/timeline", loadTimelineRouter());
  return app;
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("audit: legacy route is mounted with auth + tenant guard", () => {
  assert.match(serverJs, /app\.use\(\s*[\s\S]*"\/timeline"/);
  assert.match(serverJs, /requireAtlasUser/);
  assert.match(serverJs, /organizationGuard\(\{\s*allowSuperAdminCrossOrg:\s*false\s*\}\)/);
});

test("audit: route resolves org from auth context only", () => {
  assert.match(routeJs, /req\.authContext\?\.organizationId/);
  assert.doesNotMatch(routeJs, /req\.query\.organizationId/);
  assert.doesNotMatch(routeJs, /req\.body/);
});

test("audit: service scopes lookup by organization_id and prospect_phone", () => {
  assert.match(serviceJs, /\.eq\("prospect_phone", phone\)/);
  assert.match(serviceJs, /\.eq\("organization_id", organizationId\)/);
  assert.match(serviceJs, /if \(!organizationId\)/);
});

test("service: rejects lookup without organizationId", async () => {
  await assert.rejects(
    () => timelineService.getConversationTimeline(PHONE, null),
    (error) => error.name === "TimelineOrganizationRequiredError"
  );
});

test("service: tenant A reads only tenant A rows for shared phone", async () => {
  const rows = [
    {
      id: "log-a",
      prospect_phone: PHONE,
      organization_id: ORG_A,
      message: "tenant-a-message"
    },
    {
      id: "log-b",
      prospect_phone: PHONE,
      organization_id: ORG_B,
      message: "tenant-b-message"
    }
  ];

  timelineService.setConversationLogQueryClientForTests(createMockConversationLogClient(rows));

  try {
    const tenantA = await timelineService.getConversationTimeline(PHONE, ORG_A);
    assert.equal(tenantA.length, 1);
    assert.equal(tenantA[0].id, "log-a");

    const tenantB = await timelineService.getConversationTimeline(PHONE, ORG_B);
    assert.equal(tenantB.length, 1);
    assert.equal(tenantB[0].id, "log-b");
  } finally {
    timelineService.resetConversationLogQueryClientForTests();
  }
});

test("HTTP: unauthenticated access fails", async () => {
  const app = createTimelineTestApp({ authContext: null });

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/timeline/${encodeURIComponent(PHONE)}`);
    assert.equal(response.status, 401);
  });
});

test("HTTP: tenant A reads its own timeline", async () => {
  const rows = [
    {
      id: "log-a",
      prospect_phone: PHONE,
      organization_id: ORG_A,
      message: "tenant-a-message"
    }
  ];

  timelineService.setConversationLogQueryClientForTests(createMockConversationLogClient(rows));

  const app = createTimelineTestApp({
    authContext: {
      userId: "user-a",
      organizationId: ORG_A,
      saasRole: SAAS_ROLES.REPRESENTATIVE,
      role: "agent"
    }
  });

  try {
    await withServer(app, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/timeline/${encodeURIComponent(PHONE)}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.length, 1);
      assert.equal(body[0].id, "log-a");
    });
  } finally {
    timelineService.resetConversationLogQueryClientForTests();
  }
});

test("HTTP: tenant A cannot read tenant B timeline for same phone", async () => {
  const rows = [
    {
      id: "log-b",
      prospect_phone: PHONE,
      organization_id: ORG_B,
      message: "tenant-b-message"
    }
  ];

  timelineService.setConversationLogQueryClientForTests(createMockConversationLogClient(rows));

  const app = createTimelineTestApp({
    authContext: {
      userId: "user-a",
      organizationId: ORG_A,
      saasRole: SAAS_ROLES.REPRESENTATIVE,
      role: "agent"
    }
  });

  try {
    await withServer(app, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/timeline/${encodeURIComponent(PHONE)}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body, []);
    });
  } finally {
    timelineService.resetConversationLogQueryClientForTests();
  }
});

test("HTTP: caller cannot override org through query params", async () => {
  let capturedOrgId = null;
  const original = timelineService.getConversationTimeline;
  timelineService.getConversationTimeline = async (phone, organizationId) => {
    capturedOrgId = organizationId;
    return [];
  };

  const app = createTimelineTestApp({
    authContext: {
      userId: "user-a",
      organizationId: ORG_A,
      saasRole: SAAS_ROLES.REPRESENTATIVE,
      role: "agent"
    },
    query: {
      organizationId: ORG_B,
      organization_id: ORG_B
    }
  });

  try {
    await withServer(app, async (port) => {
      const response = await fetch(
        `http://127.0.0.1:${port}/timeline/${encodeURIComponent(PHONE)}?organizationId=${ORG_B}&organization_id=${ORG_B}`
      );
      assert.equal(response.status, 403);
      assert.equal(capturedOrgId, null);
    });
  } finally {
    timelineService.getConversationTimeline = original;
  }
});

test("HTTP: super-admin cannot implicitly cross org on legacy timeline route", async () => {
  let capturedOrgId = null;
  const original = timelineService.getConversationTimeline;
  timelineService.getConversationTimeline = async (phone, organizationId) => {
    capturedOrgId = organizationId;
    return [];
  };

  const app = createTimelineTestApp({
    authContext: {
      userId: "super-admin",
      organizationId: ORG_A,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      role: "administrator"
    },
    query: {
      organizationId: ORG_B
    }
  });

  try {
    await withServer(app, async (port) => {
      const response = await fetch(
        `http://127.0.0.1:${port}/timeline/${encodeURIComponent(PHONE)}?organizationId=${ORG_B}`
      );
      assert.equal(response.status, 403);
      assert.equal(capturedOrgId, null);
    });
  } finally {
    timelineService.getConversationTimeline = original;
  }
});

test("HTTP: authenticated user without organization context is forbidden", async () => {
  const app = createTimelineTestApp({
    authContext: {
      userId: "user-no-org",
      organizationId: null,
      saasRole: SAAS_ROLES.REPRESENTATIVE,
      role: "agent"
    }
  });

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/timeline/${encodeURIComponent(PHONE)}`);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "FORBIDDEN");
  });
});
