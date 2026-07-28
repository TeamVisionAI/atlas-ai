#!/usr/bin/env node
/**
 * Sprint 17.0.1 — Development-only password reset utility.
 * Updates an existing user's password_hash using the production hashPassword() service.
 * Does not create users or bypass authentication.
 */

require("dotenv").config();

const { hashPassword } = require("../security/passwordService");
const { findUserByEmail } = require("../services/atlasUserService");
const identityWriteService = require("../services/identityWriteService");

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
  await identityWriteService.changePassword(user.id, passwordHash);

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
