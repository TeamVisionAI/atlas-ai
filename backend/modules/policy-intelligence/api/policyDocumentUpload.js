/**
 * Multipart upload middleware for policy documents.
 * Implements BR-052.
 */

const multer = require("multer");
const {
  MAX_POLICY_DOCUMENT_BYTES,
  ALLOWED_POLICY_DOCUMENT_MIME_TYPES
} = require("../domain/constants");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_POLICY_DOCUMENT_BYTES },
  fileFilter(_req, file, callback) {
    if (ALLOWED_POLICY_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      callback(null, true);
      return;
    }

    const error = new Error(
      "Unsupported document type. Allowed: PDF, JPEG, PNG, WebP, plain text, JSON."
    );
    error.statusCode = 400;
    error.publicCode = "POLICY_DOCUMENT_TYPE_INVALID";
    callback(error);
  }
});

const uploadMiddleware = upload.single("document");

function handlePolicyDocumentUpload(req, res, next) {
  uploadMiddleware(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "POLICY_DOCUMENT_TOO_LARGE",
        message: "Document must be 25 MB or smaller."
      });
    }

    return res.status(error.statusCode || 400).json({
      error: error.publicCode || "POLICY_DOCUMENT_UPLOAD_FAILED",
      message: error.message
    });
  });
}

function parseStructuredFields(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }

  if (typeof raw === "object") {
    return raw;
  }

  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const error = new Error("structuredFields must be valid JSON.");
    error.statusCode = 400;
    error.publicCode = "POLICY_EXTRACTION_FIELDS_INVALID";
    throw error;
  }
}

module.exports = {
  handlePolicyDocumentUpload,
  parseStructuredFields
};
