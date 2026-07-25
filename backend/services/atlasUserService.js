/**
 * Sprint 10.1 / LC1 — Atlas user lookup and session management.
 */

const crypto = require("crypto");
const { supabase } = require("./supabaseService");

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isMissingAtlasAuthTable(error) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    String(error.message || "").includes("atlas_users") ||
    String(error.message || "").includes("atlas_sessions")
  );
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    display_name: user.display_name,
    role: user.role,
    status: user.status,
    organization_id: user.organization_id,
    division_id: user.division_id,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

async function findUserById(userId) {
  const { data, error } = await supabase
    .from("atlas_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      return null;
    }

    throw error;
  }

  return data;
}

async function findUserByEmail(email) {
  if (!email) {
    return null;
  }

  const { data, error } = await supabase
    .from("atlas_users")
    .select("*")
    .eq("email", String(email).trim().toLowerCase())
    .maybeSingle();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      return null;
    }

    throw error;
  }

  return data;
}

async function findUserBySessionToken(token) {
  if (!token) {
    return null;
  }

  const { data, error } = await supabase
    .from("atlas_sessions")
    .select("token, expires_at, revoked_at, user:atlas_users(*)")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      return resolveBootstrapUser(token);
    }

    throw error;
  }

  if (!data?.user || data.revoked_at) {
    return null;
  }

  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) {
    return null;
  }

  if (data.user.status === "disabled") {
    return null;
  }

  return data.user;
}

function resolveBootstrapUser(token) {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const bootstrapToken = process.env.ATLAS_BOOTSTRAP_TOKEN;

  if (!bootstrapToken || token !== bootstrapToken) {
    return null;
  }

  return {
    id: process.env.ATLAS_DEFAULT_USER_ID || DEFAULT_USER_ID,
    email: process.env.ATLAS_DEFAULT_USER_EMAIL || "ana@teamvision.ai",
    display_name: process.env.ATLAS_DEFAULT_USER_NAME || "Ana",
    first_name: "Ana",
    last_name: "Recruiter",
    role: "recruiter",
    status: "active",
    organization_id: "00000000-0000-4000-8000-000000000001"
  };
}

async function createSessionForUser(userId, { rememberMe = false } = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const ttl = rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();

  const { data, error } = await supabase
    .from("atlas_sessions")
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt,
      remember_me: Boolean(rememberMe)
    })
    .select("token, expires_at, remember_me")
    .single();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Atlas auth tables are required in production.");
      }

      return {
        token: process.env.ATLAS_BOOTSTRAP_TOKEN || token,
        expiresAt,
        rememberMe: Boolean(rememberMe),
        bootstrap: true
      };
    }

    throw error;
  }

  return {
    token: data.token,
    expiresAt: data.expires_at,
    rememberMe: data.remember_me,
    bootstrap: false
  };
}

async function revokeSessionByToken(token) {
  if (!token) {
    return;
  }

  const { error } = await supabase
    .from("atlas_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);

  if (error && !isMissingAtlasAuthTable(error)) {
    throw error;
  }
}

async function revokeAllSessionsForUser(userId) {
  const { error } = await supabase
    .from("atlas_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error && !isMissingAtlasAuthTable(error)) {
    throw error;
  }
}

async function bootstrapSession() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const userId = process.env.ATLAS_DEFAULT_USER_ID || DEFAULT_USER_ID;
  let user = await findUserById(userId);

  if (!user) {
    user = resolveBootstrapUser(process.env.ATLAS_BOOTSTRAP_TOKEN);
  }

  if (!user) {
    return null;
  }

  const session = await createSessionForUser(user.id);
  return { user, session };
}

module.exports = {
  DEFAULT_USER_ID,
  findUserById,
  findUserByEmail,
  findUserBySessionToken,
  createSessionForUser,
  revokeSessionByToken,
  revokeAllSessionsForUser,
  bootstrapSession,
  resolveBootstrapUser,
  sanitizeUser
};
