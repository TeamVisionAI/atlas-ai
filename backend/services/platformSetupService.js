/**
 * LC1.1 Part 0 — First-time platform setup (bootstrap wizard).
 */

const { supabase } = require("./supabaseService");
const { hashPassword } = require("../security/passwordService");
const { ROLES, USER_STATUSES } = require("../security/roles");
const { writeAuditLog } = require("../security/auditLogService");
const { writeLoginHistory } = require("./loginHistoryService");
const {
  createSessionForUser,
  sanitizeUser,
  findUserByEmail
} = require("./atlasUserService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { isPgFallbackEnabled, pgQueryOne } = require("./pgFallback");
const { performBootstrapInstall } = require("../dev/tools/performBootstrapInstall");
const identityWriteService = require("./identityWriteService");

const SETUP_KEY = "setup_completed_at";

function slugifyOrganizationName(name) {
  return String(name || "organization")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "organization";
}

async function getSetupCompletedAt() {
  const { data, error } = await supabase
    .from("atlas_platform_settings")
    .select("value")
    .eq("key", SETUP_KEY)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return null;
    }

    throw error;
  }

  return data?.value?.completedAt || null;
}

async function countUsers() {
  const { count, error } = await supabase
    .from("atlas_users")
    .select("id", { count: "exact", head: true });

  if (error) {
    if (error.code === "42P01") {
      return 0;
    }

    throw error;
  }

  return count || 0;
}

async function getSetupStatus() {
  if (isPgFallbackEnabled()) {
    const userRow = await pgQueryOne("SELECT COUNT(*)::int AS count FROM atlas_users");
    let settingRow = null;

    try {
      settingRow = await pgQueryOne(
        "SELECT value FROM atlas_platform_settings WHERE key = $1",
        [SETUP_KEY]
      );
    } catch {
      settingRow = null;
    }

    const completedAt = settingRow?.value?.completedAt || null;
    const userCount = userRow?.count || 0;

    return {
      setupRequired: !completedAt && userCount === 0,
      setupCompletedAt: completedAt,
      userCount
    };
  }

  const [completedAt, userCount] = await Promise.all([getSetupCompletedAt(), countUsers()]);
  const setupRequired = !completedAt && userCount === 0;

  return {
    setupRequired,
    setupCompletedAt: completedAt,
    userCount
  };
}

async function markSetupCompleted(adminUserId, organizationId) {
  const completedAt = new Date().toISOString();

  await supabase.from("atlas_platform_settings").upsert({
    key: SETUP_KEY,
    value: {
      completedAt,
      administratorUserId: adminUserId,
      organizationId
    },
    updated_at: completedAt
  });

  return completedAt;
}

async function completePlatformSetup(input = {}, auditMeta = {}) {
  const status = await getSetupStatus();

  if (!status.setupRequired) {
    const error = new Error("Platform setup has already been completed.");
    error.statusCode = 403;
    error.publicCode = "SETUP_COMPLETED";
    throw error;
  }

  const organizationName = String(input.organizationName || "").trim();
  const firstName = String(input.ownerFirstName || input.firstName || "").trim();
  const lastName = String(input.ownerLastName || input.lastName || "").trim();
  const email = String(input.ownerEmail || input.email || "")
    .trim()
    .toLowerCase();
  const password = String(input.password || "");
  const confirmPassword = String(input.confirmPassword || input.passwordConfirm || "");

  if (!organizationName || !firstName || !lastName || !email || !password) {
    const error = new Error("All setup fields are required.");
    error.statusCode = 400;
    throw error;
  }

  if (password !== confirmPassword) {
    const error = new Error("Passwords do not match.");
    error.statusCode = 400;
    throw error;
  }

  const existing = await findUserByEmail(email);

  if (existing) {
    const error = new Error("A user with this email already exists.");
    error.statusCode = 409;
    throw error;
  }

  if (isPgFallbackEnabled()) {
    const result = await performBootstrapInstall({
      organizationName,
      ownerFirstName: firstName,
      ownerLastName: lastName,
      ownerEmail: email,
      password
    });

    return {
      setupCompletedAt: new Date().toISOString(),
      organization: result.organization,
      user: sanitizeUser(result.user),
      session: {
        token: result.token,
        expiresAt: result.expiresAt,
        rememberMe: false,
        bootstrap: false
      }
    };
  }

  const passwordHash = hashPassword(password);
  const slug = slugifyOrganizationName(organizationName);

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .upsert(
      {
        id: DEFAULT_ORGANIZATION_ID,
        name: organizationName,
        slug,
        status: "active",
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    )
    .select("id, name, slug")
    .single();

  if (organizationError) {
    throw organizationError;
  }


  const adminUser = await identityWriteService.createUser({
    email,
    first_name: firstName,
    last_name: lastName,
    organization_id: organization.id,
    role: ROLES.ADMINISTRATOR,
    status: USER_STATUSES.ACTIVE,
    password_hash: passwordHash
  });

  await supabase
    .from("organizations")
    .update({
      owner_user_id: adminUser.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", organization.id);

  const setupCompletedAt = await markSetupCompleted(adminUser.id, organization.id);

  await writeAuditLog({
    organizationId: organization.id,
    userId: adminUser.id,
    userEmail: adminUser.email,
    action: "platform.setup_completed",
    targetType: "organization",
    targetId: organization.id,
    metadata: {
      organizationName,
      administratorEmail: email
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: adminUser.id,
    userEmail: adminUser.email,
    action: "user.created",
    targetType: "atlas_user",
    targetId: adminUser.id,
    metadata: { role: ROLES.ADMINISTRATOR, source: "platform_setup" },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  const session = await createSessionForUser(adminUser.id, {
    rememberMe: false,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  await writeLoginHistory({
    userId: adminUser.id,
    userEmail: adminUser.email,
    eventType: "platform_setup_login",
    result: "success",
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return {
    setupCompletedAt,
    organization,
    user: sanitizeUser(adminUser),
    session
  };
}

module.exports = {
  getSetupStatus,
  completePlatformSetup
};
