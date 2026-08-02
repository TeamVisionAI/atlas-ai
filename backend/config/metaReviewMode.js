/**
 * Meta App Review demo environment flag.
 * Enable with META_REVIEW_MODE=true on the backend (and VITE_META_REVIEW_MODE on the frontend).
 */

const { parseEnvBoolean } = require("./parseEnvBoolean");

const META_REVIEW_MODE_ENV = "META_REVIEW_MODE";

function getMetaReviewModeRawValue() {
  return process.env[META_REVIEW_MODE_ENV];
}

function isMetaReviewModeEnabled() {
  return parseEnvBoolean(getMetaReviewModeRawValue());
}

module.exports = {
  META_REVIEW_MODE_ENV,
  getMetaReviewModeRawValue,
  isMetaReviewModeEnabled
};
