/**
 * Sprint 19 — Single write path for identity data across atlas_users and users.
 * All identity mutations MUST go through this service.
 */

const { supabase } = require("./supabaseService");
const { withPostgresTransaction } = require("./pgFallback");
const { buildCandidateUrls } = require("../dev/environment/databaseConnection");
const { mapLegacyRoleToSaas, buildUsersRowFromAtlasUser } = require("./userIdentitySyncService");
const { USER_STATUSES } = require("../security/roles");

const ATLAS_WRITABLE_COLUMNS = new Set([
  "email",
  "first_name",
  "last_name",
  "display_name",
  "phone",
  "photo_url",
  "organization_id",
  "division_id",
  "reports_to_user_id",
  "role",
  "status",
  "password_hash",
  "timezone",
  "preferred_language",
  "notification_preferences",
  "profile_settings",
  "last_login_at",
  "archived_at",
  "created_at",
  "updated_at"
]);

function canUsePostgresTransactions() {
  return buildCandidateUrls().length > 0;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizeAtlasPatch(patch = {}) {
  const sanitized = {};

  for (const [key, value] of Object.entries(patch)) {
    if (ATLAS_WRITABLE_COLUMNS.has(key)) {
      sanitized[key] = value;
    }
  }

  if (sanitized.email !== undefined) {
    sanitized.email = normalizeEmail(sanitized.email);
  }

  if (!sanitized.updated_at) {
    sanitized.updated_at = new Date().toISOString();
  }

  return sanitized;
}

function buildDisplayName(firstName, lastName, fallback = "") {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function mapAtlasStatusToIsActive(status) {
  return status === USER_STATUSES.ACTIVE;
}

function mapIsActiveToAtlasStatus(isActive) {
  return isActive ? USER_STATUSES.ACTIVE : USER_STATUSES.SUSPENDED;
}

function compareIdentityRows(atlasRow, usersRow) {
  const issues = [];
  const usersRowFromAtlas = buildUsersRowFromAtlasUser(atlasRow);

  if (!usersRow) {
    issues.push({ field: "users_row", atlas: atlasRow.id, users: null });
    return issues;
  }

  const checks = [
    ["email", atlasRow.email, usersRow.email],
    ["organization_id", atlasRow.organization_id, usersRow.organization_id],
    [
      "role",
      mapLegacyRoleToSaas(atlasRow.role),
      usersRow.role
    ],
    [
      "status",
      mapAtlasStatusToIsActive(atlasRow.status),
      usersRow.is_active
    ],
    ["password_hash", atlasRow.password_hash || null, usersRow.password_hash || null],
    ["first_name", atlasRow.first_name || null, splitName(usersRow.name).firstName],
    ["last_name", atlasRow.last_name || null, splitName(usersRow.name).lastName]
  ];

  for (const [field, atlasValue, usersValue] of checks) {
    if (String(atlasValue ?? "") !== String(usersValue ?? "")) {
      issues.push({
        field,
        atlas: atlasValue,
        users: usersValue,
        expectedUsers: usersRowFromAtlas[field === "role" ? "role" : field] ?? usersRowFromAtlas[
          field === "status" ? "is_active" : field
        ]
      });
    }
  }

  return issues;
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || ""
  };
}

async function fetchAtlasUser(userId, client = null) {
  if (client) {
    const { rows } = await client.query("SELECT * FROM atlas_users WHERE id = $1 LIMIT 1", [userId]);
    return rows[0] || null;
  }

  const { data, error } = await supabase.from("atlas_users").select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertUsersRowFromAtlas(atlasRow, client = null) {
  const usersRow = buildUsersRowFromAtlasUser(atlasRow);
  const originalStatus = atlasRow.status;

  if (!usersRow?.id) {
    return null;
  }

  if (client) {
    await client.query(
      `INSERT INTO users (
        id, organization_id, name, email, password_hash, role, is_active, last_login, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        last_login = COALESCE(EXCLUDED.last_login, users.last_login),
        updated_at = EXCLUDED.updated_at`,
      [
        usersRow.id,
        usersRow.organization_id,
        usersRow.name,
        usersRow.email,
        usersRow.password_hash,
        usersRow.role,
        usersRow.is_active,
        usersRow.last_login,
        usersRow.created_at,
        usersRow.updated_at
      ]
    );
  } else {
    const { error } = await supabase.from("users").upsert(usersRow, { onConflict: "id" });

    if (error && error.code !== "42P01") {
      throw error;
    }
  }

  const refreshed = await fetchAtlasUser(atlasRow.id, client);

  if (originalStatus && refreshed?.status !== originalStatus) {
    await updateAtlasRow(
      atlasRow.id,
      { status: originalStatus, updated_at: new Date().toISOString() },
      client
    );
    atlasRow.status = originalStatus;
  }

  return usersRow;
}

async function insertAtlasRow(payload, client = null) {
  const row = sanitizeAtlasPatch(payload);
  const columns = Object.keys(row);

  if (!columns.length) {
    throw new Error("Identity create payload is empty.");
  }

  const values = columns.map((column) => row[column]);
  const placeholders = columns.map((_, index) => `$${index + 1}`);

  if (client) {
    const { rows } = await client.query(
      `INSERT INTO atlas_users (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      values
    );

    return rows[0];
  }

  const { data, error } = await supabase.from("atlas_users").insert(row).select("*").single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateAtlasRow(userId, patch, client = null) {
  const row = sanitizeAtlasPatch(patch);
  const columns = Object.keys(row);

  if (!columns.length) {
    return fetchAtlasUser(userId, client);
  }

  if (client) {
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    const values = [userId, ...columns.map((column) => row[column])];
    const { rows } = await client.query(
      `UPDATE atlas_users SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );

    if (!rows[0]) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    return rows[0];
  }

  const { data, error } = await supabase
    .from("atlas_users")
    .update(row)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function runIdentityWrite(writeFn) {
  if (canUsePostgresTransactions()) {
    return withPostgresTransaction((client) => writeFn(client));
  }

  return writeFn(null);
}

async function persistIdentityPair({ userId = null, atlasPayload = null, atlasPatch = null }) {
  return runIdentityWrite(async (client) => {
    let atlasRow;

    if (atlasPayload) {
      atlasRow = await insertAtlasRow(atlasPayload, client);
    } else if (userId && atlasPatch) {
      atlasRow = await updateAtlasRow(userId, atlasPatch, client);
    } else {
      throw new Error("persistIdentityPair requires atlasPayload or userId + atlasPatch.");
    }

    await upsertUsersRowFromAtlas(atlasRow, client);
    return atlasRow;
  });
}

async function createUser(payload) {
  const email = normalizeEmail(payload.email);

  if (!email) {
    const error = new Error("Email is required.");
    error.statusCode = 400;
    throw error;
  }

  const firstName = String(payload.first_name || payload.firstName || "").trim();
  const lastName = String(payload.last_name || payload.lastName || "").trim();

  return persistIdentityPair({
    atlasPayload: sanitizeAtlasPatch({
      ...payload,
      email,
      first_name: firstName,
      last_name: lastName,
      display_name: payload.display_name || buildDisplayName(firstName, lastName, email)
    })
  });
}

async function updateUser(userId, patch) {
  const sanitized = sanitizeAtlasPatch(patch);

  if (sanitized.first_name !== undefined || sanitized.last_name !== undefined) {
    const existing = await fetchAtlasUser(userId);

    if (!existing) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    sanitized.display_name = buildDisplayName(
      sanitized.first_name ?? existing.first_name,
      sanitized.last_name ?? existing.last_name,
      existing.email
    );
  }

  return persistIdentityPair({ userId, atlasPatch: sanitized });
}

async function changeEmail(userId, email) {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    const error = new Error("Email is required.");
    error.statusCode = 400;
    throw error;
  }

  return updateUser(userId, { email: normalized });
}

async function changePassword(userId, passwordHash) {
  return updateUser(userId, { password_hash: passwordHash });
}

async function setUserStatus(userId, status, extraPatch = {}) {
  return updateUser(userId, {
    status,
    ...extraPatch
  });
}

async function acceptInvitation(userId, passwordHash) {
  return updateUser(userId, {
    password_hash: passwordHash,
    status: USER_STATUSES.ACTIVE
  });
}

async function confirmPasswordReset(userId, passwordHash) {
  return changePassword(userId, passwordHash);
}

async function updateProfile(userId, patch) {
  return updateUser(userId, patch);
}

async function updatePhotoUrl(userId, photoUrl) {
  return updateUser(userId, { photo_url: photoUrl });
}

async function recordLastLogin(userId) {
  const timestamp = new Date().toISOString();

  return runIdentityWrite(async (client) => {
    const atlasRow = await updateAtlasRow(
      userId,
      { last_login_at: timestamp, updated_at: timestamp },
      client
    );

    if (client) {
      await client.query("UPDATE users SET last_login = $2, updated_at = $2 WHERE id = $1", [
        userId,
        timestamp
      ]);
    } else {
      const usersRow = buildUsersRowFromAtlasUser(atlasRow);
      await supabase
        .from("users")
        .upsert(
          {
            ...usersRow,
            last_login: timestamp,
            updated_at: timestamp
          },
          { onConflict: "id" }
        );
    }

    return atlasRow;
  });
}

async function repairIdentityFromAtlas(userId = null) {
  if (userId) {
    const atlasRow = await fetchAtlasUser(userId);

    if (!atlasRow) {
      return null;
    }

    await upsertUsersRowFromAtlas(atlasRow);
    return atlasRow;
  }

  const { data, error } = await supabase.from("atlas_users").select("*");

  if (error) {
    throw error;
  }

  let repaired = 0;

  for (const atlasRow of data || []) {
    await upsertUsersRowFromAtlas(atlasRow);
    repaired += 1;
  }

  return { repaired };
}

async function verifyIdentityConsistency() {
  const { data: atlasRows, error: atlasError } = await supabase.from("atlas_users").select("*");

  if (atlasError) {
    throw atlasError;
  }

  const { data: usersRows, error: usersError } = await supabase.from("users").select("*");

  if (usersError && usersError.code !== "42P01") {
    throw usersError;
  }

  const usersById = new Map((usersRows || []).map((row) => [String(row.id), row]));
  const drift = [];

  for (const atlasRow of atlasRows || []) {
    const usersRow = usersById.get(String(atlasRow.id));

    if (!usersRow) {
      drift.push({
        userId: atlasRow.id,
        email: atlasRow.email,
        issues: [{ field: "users_row", atlas: "present", users: "missing" }]
      });
      continue;
    }

    const issues = compareIdentityRows(atlasRow, usersRow);

    if (issues.length) {
      drift.push({
        userId: atlasRow.id,
        email: atlasRow.email,
        issues
      });
    }

    usersById.delete(String(atlasRow.id));
  }

  for (const [userId, usersRow] of usersById.entries()) {
    drift.push({
      userId,
      email: usersRow.email,
      issues: [{ field: "atlas_users_row", atlas: "missing", users: "present" }]
    });
  }

  return {
    atlasCount: (atlasRows || []).length,
    usersCount: (usersRows || []).length,
    drift,
    consistent: drift.length === 0
  };
}

module.exports = {
  createUser,
  updateUser,
  changeEmail,
  changePassword,
  setUserStatus,
  acceptInvitation,
  confirmPasswordReset,
  updateProfile,
  updatePhotoUrl,
  recordLastLogin,
  repairIdentityFromAtlas,
  verifyIdentityConsistency,
  compareIdentityRows,
  buildDisplayName,
  mapAtlasStatusToIsActive,
  mapIsActiveToAtlasStatus
};
