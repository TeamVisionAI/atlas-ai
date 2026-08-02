#!/usr/bin/env node
/**
 * Meta App Review — end-to-end verification (API + service layer).
 * Run: node backend/dev/verifyMetaReviewE2E.js
 *
 * Requires META_REVIEW_MODE=true, backend reachable at API_BASE (default http://127.0.0.1:3000).
 */

require("dotenv").config();

const { supabase } = require("../services/supabaseService");
const { loginWithPassword } = require("../services/authService");
const { findUserByEmail } = require("../services/atlasUserService");
const { buildAuthContextAsync } = require("../security/authorizationService");
const { filterProspectsForAuthContext } = require("../security/authorizationService");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const { isMetaReviewModeEnabled } = require("../config/metaReviewMode");
const metaReviewUserService = require("../services/metaReviewUserService");
const {
  syncMetaReviewDemoProspectsToLegacy,
  META_REVIEW_ENTRY_METHOD
} = require("../services/metaReviewLegacyProspectBridge");
const { META_REVIEW_PROSPECTS } = require("./environment/seedMetaReviewDemo");

const API_BASE = process.env.API_BASE || "http://127.0.0.1:3000";
const REVIEW_PASSWORD = "MetaReviewE2E!2026";
const REVIEW_EMAIL = `meta-review-e2e-${Date.now()}@teamvisionfinancial.com`;

const results = [];
let failed = 0;

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS: ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  failed += 1;
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name, condition, detail = "") {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, detail);
  }
}

async function apiFetch(path, { token, method = "GET", body, timeoutMs = 15000 } = {}) {
  const headers = { Accept: "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    return { status: response.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadAdminAuthContext() {
  const admin = await findUserByEmail("admin@teamvision.ai");

  if (!admin) {
    throw new Error("admin@teamvision.ai not found — cannot create review user");
  }

  return buildAuthContextAsync(admin);
}

async function cleanupReviewUser(email) {
  const user = await findUserByEmail(email);

  if (!user) {
    return;
  }

  await supabase.from("atlas_sessions").delete().eq("user_id", user.id);
  await supabase.from("atlas_users").delete().eq("id", user.id);
  await supabase.from("users").delete().eq("id", user.id);
}

async function verifyReviewUserCreation(adminContext) {
  const created = await metaReviewUserService.createReviewUser(
    {
      email: REVIEW_EMAIL,
      password: REVIEW_PASSWORD,
      firstName: "Meta",
      lastName: "Reviewer",
      role: "recruiter"
    },
    adminContext,
    {}
  );

  assert("1.1 Review user created", created.created === true, REVIEW_EMAIL);

  const reviewUser = await findUserByEmail(REVIEW_EMAIL);
  assert("1.2 Review user active in DB", reviewUser?.status === "active");

  const { data: demoRows, count } = await supabase
    .from("prospects")
    .select("phone, owner_user_id", { count: "exact" })
    .eq("entry_method", META_REVIEW_ENTRY_METHOD)
    .eq("owner_user_id", reviewUser.id);

  assert("1.3 Exactly four legacy demo prospects", count === 4, `count=${count}`);

  const expectedPhones = new Set(
    META_REVIEW_PROSPECTS.map((spec) => {
      const digits = spec.primaryPhone.replace(/\D/g, "");
      return `+1${digits.length === 10 ? digits : spec.primaryPhone}`;
    })
  );

  for (const row of demoRows || []) {
    assert(
      `1.4 Ownership on ${row.phone}`,
      row.owner_user_id === reviewUser.id
    );
    expectedPhones.delete(row.phone);
  }

  assert("1.5 All seeded phones present in legacy", expectedPhones.size === 0);

  const syncAgain = await syncMetaReviewDemoProspectsToLegacy(reviewUser);
  assert(
    "1.6 Bridge idempotent (second sync updates)",
    syncAgain.results?.every((entry) => entry.action === "updated"),
    JSON.stringify(syncAgain.results?.map((r) => r.action))
  );

  const { count: countAfter } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("entry_method", META_REVIEW_ENTRY_METHOD)
    .eq("owner_user_id", reviewUser.id);

  assert("1.7 Still exactly four demo rows after re-sync", countAfter === 4);

  return reviewUser;
}

async function verifyLoginAndApis(reviewUser) {
  let login;

  try {
    login = await loginWithPassword({
      email: REVIEW_EMAIL,
      password: REVIEW_PASSWORD
    });
  } catch (error) {
    fail("2.1 Review user login", error.message);
    return null;
  }

  assert("2.1 Review user login succeeds", Boolean(login?.session?.token));
  const token = login.session.token;

  const dashboard = await apiFetch("/api/dashboard", { token });
  assert("4.1 Dashboard API 200", dashboard.status === 200, `status=${dashboard.status}`);

  const prospects = dashboard.json?.prospects || [];
  const production = filterProductionProspects(prospects);
  const authContext = await buildAuthContextAsync(reviewUser);
  const accessible = filterProspectsForAuthContext(authContext, production);

  assert("4.2 Dashboard queue non-empty", accessible.length === 4, `accessible=${accessible.length}`);
  assert(
    "4.3 Dashboard only review-owned demo prospects",
    accessible.every((row) => row.owner_user_id === reviewUser.id)
  );

  const queue = dashboard.json?.prioritizedWorkflowQueue || [];
  assert("4.4 Prioritized queue non-empty", queue.length === 4, `queue=${queue.length}`);

  const prospectCenter = await apiFetch("/api/prospect-center", { token });
  assert("4.6 Prospect Center API 200", prospectCenter.status === 200, `status=${prospectCenter.status}`);

  const centerItems = prospectCenter.json?.items || [];
  assert(
    "4.7 Prospect Center shows exactly four demo prospects",
    centerItems.length === 4 && prospectCenter.json?.totalCount === 4,
    `items=${centerItems.length} totalCount=${prospectCenter.json?.totalCount}`
  );
  assert(
    "4.8 Dashboard count matches Prospect Center count",
    prospects.length === centerItems.length && prospects.length === queue.length,
    `dashboard=${prospects.length} center=${centerItems.length} queue=${queue.length}`
  );
  assert(
    "4.9 Prospect Center items are review-owned demos",
    centerItems.every((item) =>
      accessible.some((row) => row.phone === item.phone && row.owner_user_id === reviewUser.id)
    )
  );

  const firstPhone = queue[0]?.phone || accessible[0]?.phone;
  assert("4.5 First queue item has phone", Boolean(firstPhone), String(firstPhone));

  const centerFirstPhone = centerItems[0]?.phone;
  const openInQueuePhone = centerFirstPhone || firstPhone;
  const encodedOpenInQueue = encodeURIComponent(openInQueuePhone);
  const missionControlFromCenter = await apiFetch(`/api/mission-control/${encodedOpenInQueue}`, {
    token
  });
  assert(
    "4.10 Open in queue target loads in Mission Control",
    missionControlFromCenter.status === 200,
    `phone=${openInQueuePhone} status=${missionControlFromCenter.status}`
  );

  const encodedPhone = encodeURIComponent(firstPhone);
  const missionControl = await apiFetch(`/api/mission-control/${encodedPhone}`, { token });
  assert(
    "5.1 Mission Control API not 403",
    missionControl.status !== 403,
    `status=${missionControl.status}`
  );
  assert(
    "5.2 Mission Control API loads prospect",
    missionControl.status === 200,
    missionControl.json?.error || missionControl.json?.message || ""
  );

  const workspace = await apiFetch(`/api/prospect-workspace/${encodedPhone}`, { token });
  assert(
    "6.1 Prospect Workspace API 200",
    workspace.status === 200,
    `status=${workspace.status}`
  );

  const missions = await apiFetch(`/api/missions/prospect/${encodedPhone}`, { token });
  assert(
    "5.3 Missions API loads for demo prospect",
    missions.status === 200,
    `status=${missions.status}`
  );

  const whatsappStatus = await apiFetch("/api/meta/embedded-signup/status", { token });
  assert(
    "7.1 WhatsApp status API reachable for reviewer",
    whatsappStatus.status === 200,
    `status=${whatsappStatus.status}`
  );

  const integrations = await apiFetch("/api/configuration/organization/integrations", { token });
  assert(
    "7.2 Organization integrations API reachable for reviewer",
    integrations.status === 200,
    `status=${integrations.status} ${JSON.stringify(integrations.json)}`
  );
  assert(
    "7.3 Integrations payload includes WhatsApp status",
    integrations.json?.integrations?.whatsapp != null,
    JSON.stringify(integrations.json?.integrations)
  );

  const profileConfig = await apiFetch("/api/configuration/profile", { token });
  assert(
    "8.0 Profile configuration API reachable for reviewer",
    profileConfig.status === 200,
    `status=${profileConfig.status}`
  );

  const reviewUsersList = await apiFetch("/api/admin/review-users", { token });
  assert(
    "8.1 Review Users API blocked for reviewer",
    reviewUsersList.status === 403,
    `status=${reviewUsersList.status}`
  );

  const operationsAccess = await apiFetch("/api/operations/access", { token });
  assert(
    "3.1 Operations Center not allowed for reviewer",
    operationsAccess.status === 200 && operationsAccess.json?.allowed === false,
    JSON.stringify(operationsAccess.json)
  );

  assert(
    "3.2 Reviewer role confirmed in session profile",
    operationsAccess.json?.role === "recruiter"
  );

  return { token, firstPhone };
}

async function verifyAdminReviewUsersAccess(adminContext) {
  const admin = await findUserByEmail("admin@teamvision.ai");
  let adminLogin;

  try {
    adminLogin = await loginWithPassword({
      email: admin.email,
      password: process.env.META_REVIEW_ADMIN_PASSWORD || ""
    });
  } catch {
    adminLogin = null;
  }

  if (adminLogin?.token) {
    const reviewUsers = await apiFetch("/api/admin/review-users", { token: adminLogin.token });
    assert(
      "8.2 Admin can access Review Users API",
      reviewUsers.status === 200,
      `status=${reviewUsers.status}`
    );
    return;
  }

  const list = await metaReviewUserService.listReviewUsers(adminContext);
  assert(
    "8.2 Admin can list review users (service layer)",
    Array.isArray(list.items),
    `total=${list.total}`
  );
}

async function main() {
  console.log("Meta Review E2E verification");
  console.log(`API_BASE=${API_BASE}`);
  console.log(`META_REVIEW_MODE=${process.env.META_REVIEW_MODE}`);

  assert("0.1 META_REVIEW_MODE enabled on backend", isMetaReviewModeEnabled());

  try {
    const ping = await apiFetch("/api/meta/embedded-signup/status");
    assert(
      "0.2 Backend reachable",
      ping.status === 200 || ping.status === 401,
      `status=${ping.status}`
    );
  } catch (error) {
    fail("0.2 Backend reachable", error.message);
  }

  const adminContext = await loadAdminAuthContext();

  try {
    await cleanupReviewUser(REVIEW_EMAIL);
    const reviewUser = await verifyReviewUserCreation(adminContext);
    await verifyLoginAndApis(reviewUser);
    await verifyAdminReviewUsersAccess(adminContext);
  } finally {
    await cleanupReviewUser(REVIEW_EMAIL);
  }

  console.log("\n========================================");
  console.log(`Results: ${results.length - failed}/${results.length} passed`);

  if (failed > 0) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
  }

  console.log("Meta Review E2E verification passed.");
}

main().catch((error) => {
  console.error("verifyMetaReviewE2E fatal:", error);
  process.exit(1);
});
