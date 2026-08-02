/**
 * Meta App Review demo environment flag.
 * Enable with VITE_META_REVIEW_MODE=true (set alongside backend META_REVIEW_MODE).
 */

import { parseEnvBoolean } from "./parseEnvBoolean";

export { META_REVIEW_BANNER_TEXT } from "../components/meta-review/metaReviewCopy";

export function getMetaReviewModeRawValue() {
  return import.meta.env.VITE_META_REVIEW_MODE;
}

export function isMetaReviewModeEnabled() {
  return parseEnvBoolean(getMetaReviewModeRawValue());
}
