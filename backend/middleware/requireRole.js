/**
 * LC1 — Role authorization middleware.
 */

const { ALL_ROLES } = require("../security/roles");

function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat().map((role) => String(role).toLowerCase());

  return function roleMiddleware(req, res, next) {
    const context = req.authContext;

    if (!context) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }

    if (context.role === "administrator" || roles.includes(context.role)) {
      return next();
    }

    return res.status(403).json({
      error: "FORBIDDEN",
      message: "You do not have permission to perform this action."
    });
  };
}

function requireAnyRole(roles = ALL_ROLES) {
  return requireRole(...roles);
}

module.exports = {
  requireRole,
  requireAnyRole
};
