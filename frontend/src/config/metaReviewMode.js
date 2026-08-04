/**
 * Meta App Review demo environment flag and session-scoped locker.
 *
 * VITE_META_REVIEW_MODE enables Meta Review infrastructure (review-user admin APIs,
 * demo presentation helpers). The restricted "Meta App Review Workspace" locker
 * applies only to dedicated review users identified by session.meta_review_user.
 */

import { parseEnvBoolean } from "./parseEnvBoolean";

export { META_REVIEW_BANNER_TEXT } from "../components/meta-review/metaReviewCopy";

export function getMetaReviewModeRawValue() {
  return import.meta.env.VITE_META_REVIEW_MODE;
}

export function isMetaReviewModeEnabled() {
  return parseEnvBoolean(getMetaReviewModeRawValue());
}

/** Dedicated Meta Review demo account from /api/auth/me (canonical profile flag). */
export function isMetaReviewUser(user) {
  return user?.meta_review_user === true;
}

/**
 * Restricted Meta Review workspace (banner, nav allowlist, language lock).
 * Requires both the env infrastructure flag and the dedicated review-user session flag.
 */
export function isMetaReviewWorkspaceActive(user) {
  return isMetaReviewModeEnabled() && isMetaReviewUser(user);
}
