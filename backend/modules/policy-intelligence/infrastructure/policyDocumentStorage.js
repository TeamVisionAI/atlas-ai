/**
 * Private Supabase Storage for policy documents.
 * Implements BR-052 — Atlas Extract ingestion.
 */

const { supabase } = require("../../../services/supabaseService");
const {
  POLICY_DOCUMENT_BUCKET,
  MAX_POLICY_DOCUMENT_BYTES,
  ALLOWED_POLICY_DOCUMENT_MIME_TYPES,
  SIGNED_URL_EXPIRES_SECONDS
} = require("../domain/constants");

function createHttpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

async function ensurePolicyDocumentBucket() {
  const { data: bucket, error: getError } = await supabase.storage.getBucket(POLICY_DOCUMENT_BUCKET);

  if (bucket && !getError) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(POLICY_DOCUMENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_POLICY_DOCUMENT_BYTES,
    allowedMimeTypes: [...ALLOWED_POLICY_DOCUMENT_MIME_TYPES]
  });

  if (createError && !String(createError.message || "").includes("already exists")) {
    throw createHttpError(
      createError.message || "Policy document storage bucket is not configured.",
      500,
      "POLICY_STORAGE_UNAVAILABLE"
    );
  }
}

function buildStoragePath({ organizationId, reviewId, documentId, fileName }) {
  const safeName = String(fileName || "document")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);

  return `${organizationId}/${reviewId}/${documentId}/${safeName}`;
}

async function uploadPolicyDocument({
  organizationId,
  reviewId,
  documentId,
  fileName,
  mimeType,
  buffer
}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw createHttpError("Document body is required.", 400, "POLICY_DOCUMENT_REQUIRED");
  }

  if (buffer.length > MAX_POLICY_DOCUMENT_BYTES) {
    throw createHttpError(
      "Document must be 25 MB or smaller.",
      400,
      "POLICY_DOCUMENT_TOO_LARGE"
    );
  }

  if (!ALLOWED_POLICY_DOCUMENT_MIME_TYPES.includes(mimeType)) {
    throw createHttpError(
      "Unsupported document type. Allowed: PDF, JPEG, PNG, WebP, plain text, JSON.",
      400,
      "POLICY_DOCUMENT_TYPE_INVALID"
    );
  }

  await ensurePolicyDocumentBucket();

  const storagePath = buildStoragePath({
    organizationId,
    reviewId,
    documentId,
    fileName
  });

  const { error } = await supabase.storage.from(POLICY_DOCUMENT_BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
    cacheControl: "3600"
  });

  if (error) {
    throw createHttpError(
      error.message || "Failed to store policy document.",
      500,
      "POLICY_DOCUMENT_UPLOAD_FAILED"
    );
  }

  return { storagePath, bucket: POLICY_DOCUMENT_BUCKET };
}

async function downloadPolicyDocument(storagePath) {
  if (!storagePath) {
    throw createHttpError("Document storage path is missing.", 404, "POLICY_DOCUMENT_NOT_FOUND");
  }

  const { data, error } = await supabase.storage.from(POLICY_DOCUMENT_BUCKET).download(storagePath);

  if (error || !data) {
    throw createHttpError(
      error?.message || "Failed to download policy document.",
      500,
      "POLICY_DOCUMENT_DOWNLOAD_FAILED"
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return { buffer, storagePath, bucket: POLICY_DOCUMENT_BUCKET };
}

async function createSignedDownloadUrl(storagePath, expiresIn = SIGNED_URL_EXPIRES_SECONDS) {
  if (!storagePath) {
    throw createHttpError("Document storage path is missing.", 404, "POLICY_DOCUMENT_NOT_FOUND");
  }

  const { data, error } = await supabase.storage
    .from(POLICY_DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw createHttpError(
      error?.message || "Failed to create download URL.",
      500,
      "POLICY_DOCUMENT_URL_FAILED"
    );
  }

  return {
    url: data.signedUrl,
    expiresIn
  };
}

module.exports = {
  ensurePolicyDocumentBucket,
  buildStoragePath,
  uploadPolicyDocument,
  downloadPolicyDocument,
  createSignedDownloadUrl,
  POLICY_DOCUMENT_BUCKET,
  MAX_POLICY_DOCUMENT_BYTES,
  ALLOWED_POLICY_DOCUMENT_MIME_TYPES
};
