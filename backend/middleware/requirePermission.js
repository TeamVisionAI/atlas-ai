/**
 * LC1 — Permission authorization middleware.
 */

const { hasPermission } = require("../security/authorizationService");

function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    const context = req.authContext;

    if (!context) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }

    if (!hasPermission(context, permission)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You do not have permission to perform this action."
      });
    }

    return next();
  };
}

module.exports = {
  requirePermission
};
