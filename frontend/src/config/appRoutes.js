/** Base path for the private Atlas application (all in-app routes live under this prefix). */
export const APP_BASE = "/app";

export function appPath(subpath = "") {
  if (!subpath) {
    return APP_BASE;
  }

  const normalized = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return `${APP_BASE}${normalized}`;
}
