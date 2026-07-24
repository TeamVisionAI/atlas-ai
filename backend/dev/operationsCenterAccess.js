/**
 * Sprint 17.0 — Operations Center access control.
 * Visible when NODE_ENV !== production OR user is Developer/Admin.
 */

const DEFAULT_ADMIN_EMAILS = Object.freeze([
  "ana@teamvision.ai",
  "niovel@teamvision.ai"
]);

function parseAdminEmails() {
  const configured = String(process.env.ATLAS_OPS_ADMIN_EMAILS || "").trim();

  if (!configured) {
    return [...DEFAULT_ADMIN_EMAILS];
  }

  return configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isNonProductionEnvironment() {
  return process.env.NODE_ENV !== "production";
}

function isAdminUser(user) {
  if (!user?.email) {
    return false;
  }

  return parseAdminEmails().includes(String(user.email).toLowerCase());
}

function isOperationsCenterEnabled() {
  return (
    isNonProductionEnvironment() ||
    process.env.ENABLE_OPERATIONS_CENTER === "true"
  );
}

function canAccessOperationsCenter(user) {
  if (!isOperationsCenterEnabled()) {
    return false;
  }

  return isNonProductionEnvironment() || isAdminUser(user);
}

function getOperationsAccessProfile(user) {
  const enabled = isOperationsCenterEnabled();
  const allowed = enabled && canAccessOperationsCenter(user);

  return {
    enabled,
    allowed,
    environment: process.env.NODE_ENV || "development",
    role: isAdminUser(user) ? "admin" : isNonProductionEnvironment() ? "developer" : null
  };
}

module.exports = {
  parseAdminEmails,
  isNonProductionEnvironment,
  isAdminUser,
  isOperationsCenterEnabled,
  canAccessOperationsCenter,
  getOperationsAccessProfile
};
