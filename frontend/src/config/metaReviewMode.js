/**
 * Meta App Review demo environment flag.
 * Enable with VITE_META_REVIEW_MODE=true (set alongside backend META_REVIEW_MODE).
 */

export { META_REVIEW_BANNER_TEXT } from "../components/meta-review/metaReviewCopy";

export function isMetaReviewModeEnabled() {
  const configured = import.meta.env.VITE_META_REVIEW_MODE;

  if (configured === "true") {
    return true;
  }

  if (configured === "false") {
    return false;
  }

  return false;
}
