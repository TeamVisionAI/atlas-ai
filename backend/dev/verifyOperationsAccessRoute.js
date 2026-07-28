#!/usr/bin/env node
/**
 * Verify GET /api/operations/access returns 200 for all authenticated roles.
 * Run: node backend/dev/verifyOperationsAccessRoute.js
 */

require("dotenv").config();

const express = require("express");
const { loginWithPassword } = require("../services/authService");
const { hashPassword } = require("../security/passwordService");
const identityWriteService = require("../services/identityWriteService");
const { findUserByEmail } = require("../services/atlasUserService");
const { ROLES, USER_STATUSES } = require("../security/roles");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { supabase } = require("../services/supabaseService");
const createOperationsRoutes = require("./operationsRoutes");
const { authenticate } = require("../middleware/authenticate");

const TEST_EMAIL = `ops-access-${Date.now()}@example.test`;
const TEST_PASSWORD = "OpsAccessTest!2026";

function assert(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`FAILED: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  console.log(`PASS: ${name}`);
}

async function requestAccess(token) {
  const app = express();
  app.use(express.json());
  app.use("/api/operations", authenticate, createOperationsRoutes());

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/operations/access`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function cleanup(email) {
  const user = await findUserByEmail(email);

  if (!user) {
    return;
  }

  await supabase.from("atlas_sessions").delete().eq("user_id", user.id);
  await supabase.from("users").delete().eq("id", user.id);
  await supabase.from("atlas_users").delete().eq("id", user.id);
}

async function createActiveRecruiter(email, password) {
  const user = await identityWriteService.createUser({
    email,
    first_name: "Ops",
    last_name: "Access",
    organization_id: DEFAULT_ORGANIZATION_ID,
    role: ROLES.RECRUITER,
    status: USER_STATUSES.ACTIVE,
    password_hash: hashPassword(password)
  });

  return user;
}

async function main() {
  console.log("=== Operations Access Route Verification ===\n");

  await cleanup(TEST_EMAIL);
  await createActiveRecruiter(TEST_EMAIL, TEST_PASSWORD);

  const recruiterLogin = await loginWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    ipAddress: "127.0.0.1",
    userAgent: "verifyOperationsAccessRoute"
  });

  const recruiterResult = await requestAccess(recruiterLogin.session.token);
  assert("recruiter /access returns 200", recruiterResult.status === 200, `status=${recruiterResult.status}`);
  assert("recruiter /access allowed:false", recruiterResult.body.allowed === false);

  const supportPassword = process.env.ATLAS_TEST_PASSWORD || "TempReset!2026";
  const supportLogin = await loginWithPassword({
    email: "support@teamvisionfinancial.com",
    password: supportPassword,
    ipAddress: "127.0.0.1",
    userAgent: "verifyOperationsAccessRoute"
  }).catch(() => null);

  if (supportLogin?.session?.token) {
    const adminResult = await requestAccess(supportLogin.session.token);
    assert("administrator /access returns 200", adminResult.status === 200, `status=${adminResult.status}`);
    assert(
      "administrator /access includes allowed flag",
      typeof adminResult.body.allowed === "boolean"
    );
  } else {
    console.log("SKIP: support@ login (set ATLAS_TEST_PASSWORD if needed)");
  }

  await cleanup(TEST_EMAIL);

  console.log("\n=== Operations access route verification complete ===");
}

main().catch(async (error) => {
  console.error("\n✗ FAIL:", error.message);
  await cleanup(TEST_EMAIL).catch(() => {});
  process.exit(1);
});
