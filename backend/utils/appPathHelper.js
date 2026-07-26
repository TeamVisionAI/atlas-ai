/**
 * Shared app path helper for backend redirects.
 */

const APP_BASE = "/app";

function appPath(subpath = "") {
  if (!subpath) {
    return APP_BASE;
  }

  const normalized = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return `${APP_BASE}${normalized}`;
}

module.exports = {
  APP_BASE,
  appPath
};
