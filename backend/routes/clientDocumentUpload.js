/**
 * BR-183 — multipart upload middleware for client documents.
 * Memory only. Never writes uploaded content to the local filesystem.
 */

const multer = require("multer");
const {
  MAX_CLIENT_DOCUMENT_BYTES,
  ALLOWED_CLIENT_DOCUMENT_MIME_TYPES
} = require("../core/clientDocuments/constants");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CLIENT_DOCUMENT_BYTES },
  fileFilter(_req, file, callback) {
    if (ALLOWED_CLIENT_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    const error = new Error("Unsupported document type. Allowed: PDF, JPEG, PNG.");
    error.statusCode = 400;
    error.publicCode = "DOCUMENT_TYPE_INVALID";
    callback(error);
  }
});

const uploadMiddleware = upload.single("file");

function handleClientDocumentUpload(req, res, next) {
  uploadMiddleware(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "DOCUMENT_TOO_LARGE",
        message: "Document must be 10 MB or smaller."
      });
    }
    return res.status(error.statusCode || 400).json({
      error: error.publicCode || "DOCUMENT_UPLOAD_FAILED",
      message: error.message
    });
  });
}

module.exports = {
  handleClientDocumentUpload
};
