/**
 * Sprint 19.1 — Multipart upload middleware for profile photos.
 */

const multer = require("multer");
const { MAX_UPLOAD_BYTES, ALLOWED_MIME_TYPES } = require("../services/profilePhotoService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter(_req, file, callback) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    const error = new Error("Photo must be JPG, PNG, or WebP.");
    error.statusCode = 400;
    error.publicCode = "INVALID_IMAGE_TYPE";
    callback(error);
  }
});

const uploadProfilePhotoMiddleware = upload.single("photo");

function handleProfilePhotoUpload(req, res, next) {
  uploadProfilePhotoMiddleware(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "PHOTO_TOO_LARGE",
        message: "Photo must be 5 MB or smaller."
      });
    }

    return res.status(error.statusCode || 400).json({
      error: error.publicCode || "PHOTO_UPLOAD_FAILED",
      message: error.message
    });
  });
}

module.exports = {
  handleProfilePhotoUpload
};
