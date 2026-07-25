/**
 * Sprint 17.0 / LC1 — Operations Center access control (RBAC).
 */

const { buildAuthContext, canAccessOperationsCenter } = require("../security/authorizationService");
const { ROLES } = require("../security/roles");

function isNonProductionEnvironment() {
  return process.env.NODE_ENV !== "production";
}

function isOperationsCenterEnabled() {
  return (
    isNonProductionEnvironment() ||
    process.env.ENABLE_OPERATIONS_CENTER === "true"
  );
}

function canAccessOperationsCenterForUser(user) {
  if (!isOperationsCenterEnabled()) {
    return false;
  }

  const context = buildAuthContext(user);
  return canAccessOperationsCenter(context);
}

function getOperationsAccessProfile(user) {
  const enabled = isOperationsCenterEnabled();
  const context = buildAuthContext(user);
  const allowed = enabled && canAccessOperationsCenter(context);

  return {
    enabled,
    allowed,
    environment: process.env.NODE_ENV || "development",
    role: context?.role || null,
    permissions: context?.permissions || []
  };
}

module.exports = {
  isNonProductionEnvironment,
  isOperationsCenterEnabled,
  canAccessOperationsCenter: canAccessOperationsCenterForUser,
  getOperationsAccessProfile,
  ROLES
};
