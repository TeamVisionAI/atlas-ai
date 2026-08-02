/**
 * Meta App Review demo environment flag.
 * Enable with META_REVIEW_MODE=true on the backend (and VITE_META_REVIEW_MODE on the frontend).
 */

function isMetaReviewModeEnabled() {
  return process.env.META_REVIEW_MODE === "true";
}

module.exports = {
  isMetaReviewModeEnabled
};
