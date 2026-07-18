/**
 * Sprint 10.1 — Atlas user lookup and session management.
 */

const crypto = require("crypto");
const { supabase } = require("./supabaseService");

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

async function findUserBySessionToken(token) {
  if (!token) {
    return null;
  }

  const { data, error } = await supabase
    .from("atlas_sessions")
    .select("token, expires_at, user:atlas_users(*)")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      return resolveBootstrapUser(token);
    }

    throw error;
  }

  if (!data?.user) {
    return null;
  }

  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) {
    return null;
  }

  return data.user;
}

function resolveBootstrapUser(token) {
  const bootstrapToken = process.env.ATLAS_BOOTSTRAP_TOKEN;

  if (!bootstrapToken || token !== bootstrapToken) {
    return null;
  }

  return {
    id: process.env.ATLAS_DEFAULT_USER_ID || DEFAULT_USER_ID,
    email: process.env.ATLAS_DEFAULT_USER_EMAIL || "ana@teamvision.ai",
    display_name: process.env.ATLAS_DEFAULT_USER_NAME || "Ana",
    first_name: "Ana",
    last_name: "Recruiter"
  };
}

async function createSessionForUser(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from("atlas_sessions")
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt
    })
    .select("token, expires_at")
    .single();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      return {
        token: process.env.ATLAS_BOOTSTRAP_TOKEN || token,
        expiresAt,
        bootstrap: true
      };
    }

    throw error;
  }

  return {
    token: data.token,
    expiresAt: data.expires_at,
    bootstrap: false
  };
}

async function bootstrapSession() {
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
  findUserBySessionToken,
  createSessionForUser,
  bootstrapSession,
  resolveBootstrapUser
};
