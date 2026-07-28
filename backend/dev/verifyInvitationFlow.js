#!/usr/bin/env node
/**
 * LC1.1 — Invitation validation and onboarding flow verification.
 */

require("dotenv").config();

const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");
const { hashToken, generateToken } = require("../security/tokenService");
const {
  validateInvitationToken,
  acceptInvitation,
  loginWithPassword
} = require("../services/authService");
const { createUser } = require("../services/identityAdminService");
const { findUserByEmail } = require("../services/atlasUserService");
const { buildAuthContext, hasPermission } = require("../security/authorizationService");
const { PERMISSIONS } = require("../security/permissions");
const { USER_STATUSES, ROLES } = require("../security/roles");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

const TEST_EMAIL = `invite-flow-${Date.now()}@example.test`;
const TEST_PASSWORD = "AtlasInviteTest!2026";

function assert(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`FAILED: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  console.log(`PASS: ${name}`);
}

async function cleanupTestUser(email) {
  const user = await findUserByEmail(email);

  if (!user) {
    return;
  }

  await supabase.from("atlas_invitation_tokens").delete().eq("user_id", user.id);
  await supabase.from("atlas_sessions").delete().eq("user_id", user.id);
  await supabase.from("users").delete().eq("id", user.id);
  await supabase.from("atlas_users").delete().eq("id", user.id);
}

async function runInvitationFlowTests() {
  const adminContext = buildAuthContext({
    id: "00000000-0000-4000-8000-000000000002",
    email: "admin@teamvision.test",
    role: ROLES.ADMINISTRATOR,
    status: USER_STATUSES.ACTIVE,
    organization_id: DEFAULT_ORGANIZATION_ID
  });

  await cleanupTestUser(TEST_EMAIL);

  const created = await createUser(
    {
      email: TEST_EMAIL,
      firstName: "Invite",
      lastName: "Flow",
      role: ROLES.RECRUITER,
      status: USER_STATUSES.PENDING_INVITATION
    },
    adminContext
  );

  assert("admin creates pending user", Boolean(created.user?.id));
  assert("invitation metadata returned", Boolean(created.invitation?.expiresAt));

  await supabase.from("atlas_invitation_tokens").delete().eq("user_id", created.user.id);

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("atlas_invitation_tokens").insert({
    user_id: created.user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: adminContext.userId
  });

  assert("invitation token stored", !insertError, insertError?.message || "");

  const emptyValidation = await validateInvitationToken("");
  assert("empty token returns valid:false", emptyValidation.valid === false);

  const invalidValidation = await validateInvitationToken("not-a-real-token");
  assert("invalid token returns valid:false", invalidValidation.valid === false);

  const validValidation = await validateInvitationToken(rawToken);
  assert("valid token returns valid:true", validValidation.valid === true);
  assert("valid token includes email", validValidation.email === TEST_EMAIL);
  assert(
    "valid token status pending_invitation",
    validValidation.status === USER_STATUSES.PENDING_INVITATION
  );
  assert("valid token includes firstName", validValidation.firstName === "Invite");

  const accepted = await acceptInvitation({
    token: rawToken,
    password: TEST_PASSWORD,
    ipAddress: "127.0.0.1",
    userAgent: "verifyInvitationFlow"
  });

  assert("accept invitation returns session", Boolean(accepted.session?.token));
  assert("accept invitation activates user", accepted.user.status === USER_STATUSES.ACTIVE);

  const usedValidation = await validateInvitationToken(rawToken);
  assert("used token returns valid:false", usedValidation.valid === false);

  const login = await loginWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    rememberMe: false,
    ipAddress: "127.0.0.1",
    userAgent: "verifyInvitationFlow"
  });

  assert("first login succeeds", Boolean(login.session?.token));
  assert(
    "workspace assignment preserved",
    String(login.user.organization_id) === String(DEFAULT_ORGANIZATION_ID)
  );
  assert("role assigned correctly", login.user.role === ROLES.RECRUITER);

  const authContext = buildAuthContext(login.user);
  assert(
    "dashboard access permission granted",
    hasPermission(authContext, PERMISSIONS.PROSPECT_READ)
  );

  await cleanupTestUser(TEST_EMAIL);
}

async function runHttpValidationChecks() {
  const baseUrl = process.env.ATLAS_TEST_BASE_URL;

  if (!baseUrl) {
    console.log("SKIP: HTTP checks (set ATLAS_TEST_BASE_URL to enable)");
    return;
  }

  const invalidResponse = await fetch(
    `${baseUrl}/api/auth/invitation/validate?token=${encodeURIComponent("invalid-token")}`
  );
  const invalidPayload = await invalidResponse.json();

  assert("HTTP invalid token status 200", invalidResponse.status === 200);
  assert("HTTP invalid token valid:false", invalidPayload.valid === false);

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const email = `invite-http-${Date.now()}@example.test`;

  const { data: user, error: userError } = await supabase
    .from("atlas_users")
    .insert({
      email,
      first_name: "Http",
      last_name: "Invite",
      display_name: "Http Invite",
      role: ROLES.RECRUITER,
      status: USER_STATUSES.PENDING_INVITATION,
      organization_id: DEFAULT_ORGANIZATION_ID
    })
    .select("*")
    .single();

  assert("HTTP fixture user created", Boolean(user?.id), userError?.message || "");

  await supabase.from("atlas_invitation_tokens").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt
  });

  const validResponse = await fetch(
    `${baseUrl}/api/auth/invitation/validate?token=${encodeURIComponent(rawToken)}`
  );
  const validPayload = await validResponse.json();

  assert("HTTP valid token status 200", validResponse.status === 200);
  assert("HTTP valid token valid:true", validPayload.valid === true);
  assert("HTTP valid token email present", validPayload.email === email);
  assert(
    "HTTP valid token status pending_invitation",
    validPayload.status === USER_STATUSES.PENDING_INVITATION
  );

  await supabase.from("atlas_invitation_tokens").delete().eq("user_id", user.id);
  await supabase.from("atlas_users").delete().eq("id", user.id);
}

async function main() {
  console.log("Invitation Flow Verification\n");
  await runInvitationFlowTests();
  await runHttpValidationChecks();
  console.log("\nInvitation flow verification complete.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  runInvitationFlowTests,
  runHttpValidationChecks
};
