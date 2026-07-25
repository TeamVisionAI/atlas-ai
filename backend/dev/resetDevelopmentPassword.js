#!/usr/bin/env node
/**
 * Sprint 17.0.1 — Development-only password reset utility.
 * Updates an existing user's password_hash using the production hashPassword() service.
 * Does not create users or bypass authentication.
 */

require("dotenv").config();

const { hashPassword } = require("../security/passwordService");
const { findUserByEmail } = require("../services/atlasUserService");
const { isPgFallbackEnabled, pgQueryOne } = require("../services/pgFallback");
const { supabase } = require("../services/supabaseService");

const DEFAULT_EMAIL = "niovel@teamvision.ai";
const DEFAULT_PASSWORD = "Atlas@2026!";

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "resetDevelopmentPassword is disabled in production. Use the account password change flow or admin tools."
    );
  }
}

function parseArgs(argv) {
  const email = String(argv[2] || DEFAULT_EMAIL).trim().toLowerCase();
  const password = String(argv[3] || DEFAULT_PASSWORD);

  if (!email) {
    throw new Error("Email is required.");
  }

  return { email, password };
}

async function resetDevelopmentPassword(email, password) {
  assertDevelopmentOnly();

  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error(`No existing user found for ${email}. This utility does not create accounts.`);
  }

  const passwordHash = hashPassword(password);
  const updatedAt = new Date().toISOString();

  if (isPgFallbackEnabled()) {
    const usersRow = await pgQueryOne(
      "UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3 RETURNING id, email",
      [passwordHash, updatedAt, user.id]
    );

    if (usersRow) {
      return { email: user.email, password };
    }

    const atlasRow = await pgQueryOne(
      "UPDATE atlas_users SET password_hash = $1, updated_at = $2 WHERE id = $3 RETURNING id, email",
      [passwordHash, updatedAt, user.id]
    );

    if (!atlasRow) {
      throw new Error(`Password update affected 0 rows for ${email}.`);
    }

    return { email: user.email, password };
  }

  const { data: usersRow, error: usersError } = await supabase
    .from("users")
    .update({ password_hash: passwordHash, updated_at: updatedAt })
    .eq("id", user.id)
    .select("id, email")
    .maybeSingle();

  if (usersError && usersError.code !== "42P01") {
    throw usersError;
  }

  if (usersRow) {
    return { email: user.email, password };
  }

  const { data: atlasRow, error: atlasError } = await supabase
    .from("atlas_users")
    .update({ password_hash: passwordHash, updated_at: updatedAt })
    .eq("id", user.id)
    .select("id, email")
    .maybeSingle();

  if (atlasError) {
    throw atlasError;
  }

  if (!atlasRow) {
    throw new Error(
      `Password update affected 0 rows for ${email}. Set SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL for development resets.`
    );
  }

  return { email: user.email, password };
}

async function main() {
  const { email, password } = parseArgs(process.argv);
  const result = await resetDevelopmentPassword(email, password);

  console.log("------------------------------------");
  console.log("Atlas Development Account Ready");
  console.log("");
  console.log("Email:");
  console.log(result.email);
  console.log("");
  console.log("Password:");
  console.log(result.password);
  console.log("------------------------------------");
  console.log("");
  console.log("Run:");
  console.log("");
  console.log("npm run dev");
  console.log("");
  console.log("Then login with:");
  console.log("");
  console.log("Email:");
  console.log(result.email);
  console.log("");
  console.log("Password:");
  console.log(result.password);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("resetDevelopmentPassword failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  resetDevelopmentPassword,
  DEFAULT_EMAIL,
  DEFAULT_PASSWORD
};
