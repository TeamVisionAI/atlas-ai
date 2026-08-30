/**
 * BR-183 — filename sanitization and MIME/size guards.
 * Never logs file contents, storage keys, or signed URLs.
 */

const {
  ALLOWED_CLIENT_DOCUMENT_MIME_TYPES,
  ALLOWED_CLIENT_DOCUMENT_EXTENSIONS,
  MAX_CLIENT_DOCUMENT_BYTES
} = require("./constants");

function baseMime(mimeType) {
  return String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function sanitizeOriginalFilename(filename, mimeType) {
  const raw = String(filename || "document").split(/[/\\]/).pop() || "document";
  const withoutNul = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  const cleaned = withoutNul.replace(/[^\w.\- ()[\]]+/g, "_").replace(/\s+/g, " ").trim();
  const ext = ALLOWED_CLIENT_DOCUMENT_EXTENSIONS[baseMime(mimeType)] || "bin";
  const stem = cleaned.replace(/\.[^.]+$/, "").slice(0, 160) || "document";
  return `${stem}.${ext}`;
}

function isAllowedClientDocumentMime(mimeType) {
  return ALLOWED_CLIENT_DOCUMENT_MIME_TYPES.includes(baseMime(mimeType));
}

function looksLikeAllowedDocument(buffer, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const mime = baseMime(mimeType);
  if (mime === "application/pdf") {
    return buffer.subarray(0, 4).toString("ascii") === "%PDF";
  }
  if (mime === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  return false;
}

function assertUploadConstraints({ buffer, mimeType, filename } = {}) {
  const error = (code, message, statusCode = 400) => {
    const err = new Error(message);
    err.code = code;
    err.publicCode = code;
    err.statusCode = statusCode;
    return err;
  };
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw error("DOCUMENT_REQUIRED", "A document file is required.");
  }
  if (buffer.length > MAX_CLIENT_DOCUMENT_BYTES) {
    throw error("DOCUMENT_TOO_LARGE", "Document must be 10 MB or smaller.");
  }
  if (!isAllowedClientDocumentMime(mimeType)) {
    throw error("DOCUMENT_TYPE_INVALID", "Unsupported document type. Allowed: PDF, JPEG, PNG.");
  }
  if (!looksLikeAllowedDocument(buffer, mimeType)) {
    throw error("DOCUMENT_TYPE_INVALID", "Unsupported document type. Allowed: PDF, JPEG, PNG.");
  }
  return {
    mimeType: baseMime(mimeType),
    originalFilename: sanitizeOriginalFilename(filename, mimeType),
    sizeBytes: buffer.length
  };
}

module.exports = {
  baseMime,
  sanitizeOriginalFilename,
  isAllowedClientDocumentMime,
  looksLikeAllowedDocument,
  assertUploadConstraints
};
