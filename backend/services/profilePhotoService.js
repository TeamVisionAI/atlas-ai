/**
 * Sprint 19.1 — Profile photo upload, resize, and Supabase Storage persistence.
 */

const sharp = require("sharp");
const { supabase } = require("./supabaseService");
const { findUserById } = require("./atlasUserService");
const { writeAuditLog } = require("../security/auditLogService");
const identityWriteService = require("./identityWriteService");

const AVATAR_BUCKET = "avatars";
const AVATAR_SIZE_PX = 256;
const WEBP_QUALITY = 82;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function buildStoragePath(organizationId, userId) {
  return `${organizationId}/${userId}/avatar.webp`;
}

function buildPublicUrl(storagePath) {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${storagePath}`;
}

function extractStoragePathFromUrl(photoUrl) {
  if (!photoUrl || typeof photoUrl !== "string") {
    return null;
  }

  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

  if (!photoUrl.includes(marker)) {
    return null;
  }

  return photoUrl.split(marker)[1]?.split("?")[0] || null;
}

async function optimizeProfilePhoto(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, {
      fit: "cover",
      position: "centre"
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function ensureAvatarBucket() {
  const { data: bucket, error: getError } = await supabase.storage.getBucket(AVATAR_BUCKET);

  if (bucket && !getError) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: 2097152,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES)
  });

  if (createError && !String(createError.message || "").includes("already exists")) {
    const bucketError = new Error(createError.message || "Avatar storage bucket is not configured.");
    bucketError.statusCode = 500;
    bucketError.publicCode = "PHOTO_STORAGE_UNAVAILABLE";
    throw bucketError;
  }
}

async function uploadToStorage(storagePath, body) {
  await ensureAvatarBucket();

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(storagePath, body, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "3600"
  });

  if (error) {
    const uploadError = new Error(error.message || "Failed to upload profile photo.");
    uploadError.statusCode = 500;
    uploadError.publicCode = "PHOTO_UPLOAD_FAILED";
    throw uploadError;
  }
}

async function removeFromStorage(storagePath) {
  if (!storagePath) {
    return;
  }

  await supabase.storage.from(AVATAR_BUCKET).remove([storagePath]).catch(() => {});
}

async function setUserPhotoUrl(userId, photoUrl) {
  return identityWriteService.updatePhotoUrl(userId, photoUrl);
}

function validateUpload(file) {
  if (!file?.buffer?.length) {
    const error = new Error("Photo file is required.");
    error.statusCode = 400;
    error.publicCode = "PHOTO_REQUIRED";
    throw error;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const error = new Error("Photo must be 5 MB or smaller.");
    error.statusCode = 400;
    error.publicCode = "PHOTO_TOO_LARGE";
    throw error;
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const error = new Error("Photo must be JPG, PNG, or WebP.");
    error.statusCode = 400;
    error.publicCode = "INVALID_IMAGE_TYPE";
    throw error;
  }
}

async function uploadProfilePhoto(userId, file, auditMeta = {}) {
  validateUpload(file);

  const user = await findUserById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const organizationId = user.organization_id;

  if (!organizationId) {
    const error = new Error("User organization is not configured.");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }

  const storagePath = buildStoragePath(organizationId, userId);
  const optimized = await optimizeProfilePhoto(file.buffer);

  await uploadToStorage(storagePath, optimized);

  const previousPath = extractStoragePathFromUrl(user.photo_url);
  const photoUrl = `${buildPublicUrl(storagePath)}?v=${Date.now()}`;
  const updatedUser = await setUserPhotoUrl(userId, photoUrl);

  if (previousPath && previousPath !== storagePath) {
    await removeFromStorage(previousPath);
  }

  await writeAuditLog({
    organizationId: updatedUser.organization_id,
    userId,
    userEmail: updatedUser.email,
    action: "user.photo_updated",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return updatedUser;
}

async function removeProfilePhoto(userId, auditMeta = {}) {
  const user = await findUserById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const storagePath = extractStoragePathFromUrl(user.photo_url);

  if (storagePath) {
    await removeFromStorage(storagePath);
  }

  const updatedUser = await setUserPhotoUrl(userId, null);

  await writeAuditLog({
    organizationId: updatedUser.organization_id,
    userId,
    userEmail: updatedUser.email,
    action: "user.photo_removed",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return updatedUser;
}

module.exports = {
  uploadProfilePhoto,
  removeProfilePhoto,
  buildStoragePath,
  buildPublicUrl,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES
};
