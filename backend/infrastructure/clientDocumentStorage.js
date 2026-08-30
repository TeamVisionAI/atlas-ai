/**
 * BR-183 — private Supabase Storage for client documents.
 * Reuses the approved Atlas private-bucket pattern.
 * Bucket: client-documents (private). Not policy-documents.
 * Service-role only. No public URLs. Do not log storage keys or signed URLs.
 */

const crypto = require("crypto");
const {
  CLIENT_DOCUMENT_BUCKET,
  MAX_CLIENT_DOCUMENT_BYTES,
  ALLOWED_CLIENT_DOCUMENT_MIME_TYPES,
  ALLOWED_CLIENT_DOCUMENT_EXTENSIONS
} = require("../core/clientDocuments/constants");
const { baseMime, assertUploadConstraints } = require("../core/clientDocuments/filename");

function getSupabase() {
  return require("../services/supabaseService").supabase;
}

function createHttpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

function sanitizePathSegment(value, fallback = "unknown") {
  const cleaned = String(value || fallback)
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return cleaned || fallback;
}

function buildStorageKey({ organizationId, clientId, documentId, mimeType }) {
  const ext = ALLOWED_CLIENT_DOCUMENT_EXTENSIONS[baseMime(mimeType)] || "bin";
  return [
    sanitizePathSegment(organizationId, "org"),
    sanitizePathSegment(clientId, "client"),
    sanitizePathSegment(documentId, "document"),
    `${crypto.randomUUID()}.${ext}`
  ].join("/");
}

function assertTenantStorageKey(storageKey, organizationId) {
  const prefix = `${sanitizePathSegment(organizationId, "org")}/`;
  if (!String(storageKey || "").startsWith(prefix)) {
    throw createHttpError("Document storage path is not tenant-scoped.", 403, "DOCUMENT_FORBIDDEN");
  }
}

async function ensureClientDocumentBucket() {
  const { data: bucket, error: getError } = await getSupabase().storage.getBucket(CLIENT_DOCUMENT_BUCKET);
  if (bucket && !getError) return;
  const { error: createError } = await getSupabase().storage.createBucket(CLIENT_DOCUMENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_CLIENT_DOCUMENT_BYTES,
    allowedMimeTypes: [...ALLOWED_CLIENT_DOCUMENT_MIME_TYPES]
  });
  if (createError && !String(createError.message || "").includes("already exists")) {
    throw createHttpError(
      "Client document storage is not configured.",
      500,
      "DOCUMENT_STORAGE_UNAVAILABLE"
    );
  }
}

async function uploadClientDocument({
  organizationId,
  clientId,
  documentId,
  mimeType,
  filename,
  buffer
}) {
  const checked = assertUploadConstraints({ buffer, mimeType, filename });
  await ensureClientDocumentBucket();
  const storageKey = buildStorageKey({
    organizationId,
    clientId,
    documentId,
    mimeType: checked.mimeType
  });
  const { error } = await getSupabase().storage.from(CLIENT_DOCUMENT_BUCKET).upload(storageKey, buffer, {
    contentType: checked.mimeType,
    upsert: false,
    cacheControl: "private, max-age=60"
  });
  if (error) {
    throw createHttpError("Failed to store document.", 500, "DOCUMENT_UPLOAD_FAILED");
  }
  return {
    storageKey,
    bucket: CLIENT_DOCUMENT_BUCKET,
    mimeType: checked.mimeType,
    originalFilename: checked.originalFilename,
    sizeBytes: checked.sizeBytes
  };
}

async function downloadClientDocument(storageKey, organizationId) {
  if (!storageKey) {
    throw createHttpError("Document storage path is missing.", 404, "DOCUMENT_NOT_FOUND");
  }
  if (organizationId) assertTenantStorageKey(storageKey, organizationId);
  const { data, error } = await getSupabase().storage.from(CLIENT_DOCUMENT_BUCKET).download(storageKey);
  if (error || !data) {
    throw createHttpError("Failed to download document.", 500, "DOCUMENT_DOWNLOAD_FAILED");
  }
  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    storageKey,
    bucket: CLIENT_DOCUMENT_BUCKET
  };
}

module.exports = {
  CLIENT_DOCUMENT_BUCKET,
  MAX_CLIENT_DOCUMENT_BYTES,
  ALLOWED_CLIENT_DOCUMENT_MIME_TYPES,
  buildStorageKey,
  assertTenantStorageKey,
  ensureClientDocumentBucket,
  uploadClientDocument,
  downloadClientDocument
};
