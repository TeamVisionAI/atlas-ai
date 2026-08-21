/**
 * Conversations Center — human-reply HTTP route contract.
 * Proves frontend-called path is mounted (not server 404 "Route not found").
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PHONE = "+17865550991";
const STATE_FILE = path.join(__dirname, "../data/workflowState.json");

const FRONTEND_HUMAN_REPLY_PATH = "/api/conversations/human-reply";

async function withTempWorkflowState(run) {
  const previous = fs.existsSync(STATE_FILE)
    ? fs.readFileSync(STATE_FILE, "utf8")
    : null;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, "{}");
  try {
    return await run();
  } finally {
    if (previous == null) {
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(STATE_FILE, previous);
    }
  }
}

function buildTestApp(overrides = {}) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const userId = req.headers["x-test-user-id"];
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    }
    req.atlasUser = { id: userId };
    next();
  });

  const {
    assertConversationsCenterAccess
  } = require("../core/conversationsCenter/conversationsCenterAccess");
  const {
    sendHumanComposerReply
  } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");
  const { ROLES } = require("../security/roles");
  const { permissionsForRole } = require("../security/permissions");

  const cc = express.Router();

  cc.post("/human-reply", async (req, res) => {
    try {
      const isPrivileged = req.atlasUser.id === NIOVEL;
      const authContext = {
        userId: req.atlasUser.id,
        role: isPrivileged ? ROLES.ADMINISTRATOR : ROLES.SUPPORT,
        permissions: permissionsForRole(
          isPrivileged ? ROLES.ADMINISTRATOR : ROLES.SUPPORT
        ),
        status: "active",
        organizationId: req.headers["x-test-org-id"]
      };
      assertConversationsCenterAccess({
        userId: req.atlasUser.id,
        organizationId: req.headers["x-test-org-id"],
        authContext,
        tenantFeatures: { conversationsCenterEnabled: true },
        env: { CONVERSATIONS_CENTER_ENABLED: "true" }
      });
      const result = await sendHumanComposerReply({
        phone: req.body?.phone,
        message: req.body?.message,
        clientRequestId: req.body?.clientRequestId,
        userId: req.atlasUser.id,
        organizationId: req.headers["x-test-org-id"],
        authContext,
        accessAlreadyAsserted: true,
        findProspectFn:
          overrides.findProspectFn ||
          (async () => ({
            id: "p1",
            phone: PHONE,
            organization_id: TEAM_VISION,
            owner_user_id: NIOVEL,
            current_step: "QUALIFICATION"
          })),
        sendFn:
          overrides.sendFn ||
          (async () => ({
            success: true,
            status: "sent_freeform",
            providerMessageId: "wamid.test",
            conversationLogId: "log-test",
            simulated: true
          }))
      });
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.code || "HUMAN_REPLY_FAILED",
        message: error.message,
        ownershipState: error.ownershipState || null
      });
    }
  });

  app.use("/api/conversations", cc);
  app.use((req, res) => {
    res.status(404).json({
      error: "Route not found",
      method: req.method,
      path: req.originalUrl
    });
  });

  return app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        base: `http://127.0.0.1:${port}`
      });
    });
  });
}

test("frontend path POST /api/conversations/human-reply is mounted (not Route not found)", async () => {
  const app = buildTestApp();
  const { server, base } = await listen(app);
  try {
    const res = await fetch(`${base}${FRONTEND_HUMAN_REPLY_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": NIOVEL,
        "x-test-org-id": TEAM_VISION
      },
      body: JSON.stringify({
        phone: PHONE,
        message: "hi",
        clientRequestId: "route-contract-1"
      })
    });
    const body = await res.json();
    assert.notEqual(body.error, "Route not found");
    assert.notEqual(res.status, 404);
  } finally {
    server.close();
  }
});

test("POST succeeds for Niovel HUMAN-owned conversation", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    await takeOverConversation(PHONE);

    const app = buildTestApp();
    const { server, base } = await listen(app);
    try {
      const res = await fetch(`${base}${FRONTEND_HUMAN_REPLY_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": NIOVEL,
          "x-test-org-id": TEAM_VISION
        },
        body: JSON.stringify({
          phone: PHONE,
          message: "Hola human route",
          clientRequestId: "route-ok-1"
        })
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.actor, "HUMAN");
      assert.notEqual(body.error, "Route not found");
    } finally {
      server.close();
    }
  });
});

test("insufficient RBAC forbidden with structured error (not Route not found)", async () => {
  const app = buildTestApp();
  const { server, base } = await listen(app);
  try {
    const res = await fetch(`${base}${FRONTEND_HUMAN_REPLY_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": OTHER_USER,
        "x-test-org-id": TEAM_VISION
      },
      body: JSON.stringify({
        phone: PHONE,
        message: "nope",
        clientRequestId: "route-forbid-1"
      })
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.error, "CONVERSATIONS_CENTER_FORBIDDEN");
    assert.notEqual(body.error, "Route not found");
  } finally {
    server.close();
  }
});

test("ATLAS-owned conversation cannot human-send (structured 409)", async () => {
  await withTempWorkflowState(async () => {
    const {
      returnConversationToAtlas
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    await returnConversationToAtlas(PHONE);

    const app = buildTestApp();
    const { server, base } = await listen(app);
    try {
      const res = await fetch(`${base}${FRONTEND_HUMAN_REPLY_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": NIOVEL,
          "x-test-org-id": TEAM_VISION
        },
        body: JSON.stringify({
          phone: PHONE,
          message: "atlas block",
          clientRequestId: "route-atlas-1"
        })
      });
      const body = await res.json();
      assert.equal(res.status, 409);
      assert.equal(body.error, "COMPOSER_REQUIRES_HUMAN_OWNERSHIP");
      assert.notEqual(body.error, "Route not found");
    } finally {
      server.close();
    }
  });
});

test("router stack registers POST /human-reply for production mount", () => {
  // Fresh require of route module to inspect Express stack.
  const resolved = require.resolve("../routes/conversationsCenter");
  delete require.cache[resolved];
  // Avoid supabase load failure by ensuring dotenv already applied.
  let router;
  try {
    router = require("../routes/conversationsCenter");
  } catch (error) {
    assert.fail(`conversationsCenter router failed to load: ${error.message}`);
  }
  const posts = (router.stack || [])
    .filter((layer) => layer.route && layer.route.methods && layer.route.methods.post)
    .map((layer) => layer.route.path);
  assert.ok(
    posts.includes("/human-reply"),
    `expected /human-reply in ${JSON.stringify(posts)}`
  );
});
