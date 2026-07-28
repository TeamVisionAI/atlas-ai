#!/usr/bin/env node
/**
 * Sprint 19.1 — Profile photo upload verification.
 */

require("dotenv").config();

const sharp = require("sharp");
const { uploadProfilePhoto, removeProfilePhoto } = require("../services/profilePhotoService");
const { validateInvitationToken } = require("../services/authService");
const { findUserByEmail } = require("../services/atlasUserService");
const { runAuthorizationMatrixTests } = require("./verifyLC1Security");

const TEST_EMAIL = process.env.PROFILE_PHOTO_TEST_EMAIL || "niovel@teamvision.ai";

function assert(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`FAILED: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  console.log(`PASS: ${name}`);
}

async function buildTestImage(type = "png") {
  const image = sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 37, g: 99, b: 235 }
    }
  });

  if (type === "jpeg") {
    return image.jpeg({ quality: 90 }).toBuffer();
  }

  if (type === "webp") {
    return image.webp({ quality: 90 }).toBuffer();
  }

  return image.png().toBuffer();
}

async function runProfilePhotoTests() {
  let user = await findUserByEmail(String(TEST_EMAIL).trim().toLowerCase());

  if (!user) {
    const { supabase } = require("../services/supabaseService");
    const { data } = await supabase.from("atlas_users").select("*").limit(1);
    user = data?.[0] || null;
  }

  if (!user) {
    console.log("SKIP: profile photo tests (no atlas_users row available)");
    return;
  }

  const pngBuffer = await buildTestImage("png");
  const updated = await uploadProfilePhoto(user.id, {
    buffer: pngBuffer,
    mimetype: "image/png",
    size: pngBuffer.length
  });

  assert("upload stores photo_url", Boolean(updated.photo_url));
  assert("photo_url references avatars bucket", updated.photo_url.includes("/avatars/"));

  const removed = await removeProfilePhoto(user.id);
  assert("remove clears photo_url", !removed.photo_url);
}

async function main() {
  console.log("Profile Photo Verification\n");

  const emptyValidation = await validateInvitationToken("");
  assert("auth regression: empty invitation token invalid", emptyValidation.valid === false);

  runAuthorizationMatrixTests();
  await runProfilePhotoTests();

  console.log("\nProfile photo verification complete.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { runProfilePhotoTests };
