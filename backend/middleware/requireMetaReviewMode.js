/**
 * Meta App Review — gate admin review-user APIs behind META_REVIEW_MODE.
 */

const { isMetaReviewModeEnabled } = require("../config/metaReviewMode");

function requireMetaReviewMode(req, res, next) {
  if (!isMetaReviewModeEnabled()) {
    return res.status(404).json({
      error: "not_found",
      message: "Route not found."
    });
  }

  return next();
}

module.exports = {
  requireMetaReviewMode
};
