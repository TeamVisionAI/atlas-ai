/**
 * Sprint 10.1 — Atlas user lookup and session management.
 */

const crypto = require("crypto");
const { supabase } = require("./supabaseService");
const jsonAtlasUserRepository = require("../repositories/jsonAtlasUserRepository");
const jsonAtlasSessionRepository = require("../repositories/jsonAtlasSessionRepository");
const { hashPassword, verifyPassword } = require("../core/passwordUtils");

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hasSupabaseAuth() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function isMissingAtlasAuthTable(error) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    String(error.message || "").includes("atlas_users") ||
    String(error.message || "").includes("atlas_sessions") ||
    String(error.message || "").includes("fetch failed")
  );
}

async function findUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  if (!hasSupabaseAuth()) {
    return jsonAtlasUserRepository.findByEmail(normalizedEmail);
  }

  const { data, error } = await supabase
    .from("atlas_users")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!error && data) {
    return data;
  }

  if (error && !isMissingAtlasAuthTable(error)) {
    throw error;
  }

  return jsonAtlasUserRepository.findByEmail(normalizedEmail);
}

async function createUserWithPassword({ email, password, displayName = null }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const passwordHash = hashPassword(password);
  const display_name = displayName || normalizedEmail.split("@")[0];

  if (!hasSupabaseAuth()) {
    const existing = await jsonAtlasUserRepository.findByEmail(normalizedEmail);

    if (existing) {
      const conflict = new Error("Email already registered");
      conflict.code = "EMAIL_EXISTS";
      throw conflict;
    }

    return jsonAtlasUserRepository.createUser({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      display_name,
      first_name: display_name,
      password_hash: passwordHash,
      auth_provider: "email"
    });
  }

  const { data, error } = await supabase
    .from("atlas_users")
    .insert({
      email: normalizedEmail,
      display_name,
      first_name: display_name,
      password_hash: passwordHash,
      auth_provider: "email"
    })
    .select("*")
    .single();

  if (!error && data) {
    return data;
  }

  if (error && !isMissingAtlasAuthTable(error)) {
    throw error;
  }

  const existing = await jsonAtlasUserRepository.findByEmail(normalizedEmail);

  if (existing) {
    const conflict = new Error("Email already registered");
    conflict.code = "EMAIL_EXISTS";
    throw conflict;
  }

  return jsonAtlasUserRepository.createUser({
    id: crypto.randomUUID(),
    email: normalizedEmail,
    display_name,
    first_name: display_name,
    password_hash: passwordHash,
    auth_provider: "email"
  });
}

async function authenticateWithPassword(email, password) {
  const user = await findUserByEmail(email);

  if (!user?.password_hash) {
    return null;
  }

  const valid = verifyPassword(password, user.password_hash);

  if (!valid) {
    return null;
  }

  return user;
}

async function signupWithPassword({ email, password, displayName = null }) {
  const existing = await findUserByEmail(email);

  if (existing) {
    const conflict = new Error("Email already registered");
    conflict.code = "EMAIL_EXISTS";
    throw conflict;
  }

  return createUserWithPassword({ email, password, displayName });
}

async function loginWithPassword(email, password) {
  return authenticateWithPassword(email, password);
}

async function findUserById(userId) {
  if (!hasSupabaseAuth()) {
    return jsonAtlasUserRepository.findById(userId);
  }

  const { data, error } = await supabase
    .from("atlas_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      return jsonAtlasUserRepository.findById(userId);
    }

    throw error;
  }

  return data || jsonAtlasUserRepository.findById(userId);
}

async function findUserBySessionToken(token) {
  if (!token) {
    return null;
  }

  if (!hasSupabaseAuth()) {
    const jsonUser = await jsonAtlasSessionRepository.findUserByToken(token);
    return jsonUser || resolveBootstrapUser(token);
  }

  const { data, error } = await supabase
    .from("atlas_sessions")
    .select("token, expires_at, user:atlas_users(*)")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    if (isMissingAtlasAuthTable(error)) {
      const jsonUser = await jsonAtlasSessionRepository.findUserByToken(token);
      return jsonUser || resolveBootstrapUser(token);
    }

    throw error;
  }

  if (!data?.user) {
    const jsonUser = await jsonAtlasSessionRepository.findUserByToken(token);
    return jsonUser || null;
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

  if (!hasSupabaseAuth()) {
    await jsonAtlasSessionRepository.createSession({
      userId,
      token,
      expiresAt
    });

    return {
      token,
      expiresAt,
      bootstrap: false
    };
  }

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
      await jsonAtlasSessionRepository.createSession({
        userId,
        token,
        expiresAt
      });

      return {
        token,
        expiresAt,
        bootstrap: false
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
  findUserByEmail,
  findUserBySessionToken,
  createSessionForUser,
  bootstrapSession,
  resolveBootstrapUser,
  signupWithPassword,
  loginWithPassword,
  createUserWithPassword
};
