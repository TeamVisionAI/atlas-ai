/**
 * Sprint 16.9 — Standard protected route middleware stack.
 * Combines authentication, tenant guard, and optional permission/role checks.
 */

const { authenticate } = require("./authenticate");
const { organizationGuard } = require("./organizationGuard");
const { authorize } = require("./authorize");

function protectedRoute(...checks) {
  return [authenticate, organizationGuard(), authorize(...checks)];
}

module.exports = {
  protectedRoute
};
