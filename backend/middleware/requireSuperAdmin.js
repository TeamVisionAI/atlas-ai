/**
 * Require authenticated Super Admin (platform operations).
 */

const { isSuperAdmin } = require("../security/saasRoles");

function requireSuperAdmin(req, res, next) {
  const saasRole = req.authContext?.saasRole || req.authContext?.role;

  if (!req.authContext || !isSuperAdmin(saasRole)) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Super Admin access is required."
    });
  }

  return next();
}

module.exports = {
  requireSuperAdmin
};
