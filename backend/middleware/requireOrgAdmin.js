/**
 * Tenant ADMIN or SUPER_ADMIN may write recruiting config.
 * RVP org:write is not sufficient (C1).
 */

const { isOrgAdmin } = require("../security/saasRoles");

function requireOrgAdmin(req, res, next) {
  const context = req.authContext;

  if (!context) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication required."
    });
  }

  if (!isOrgAdmin(context.saasRole)) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Only a tenant administrator can update recruiting configuration."
    });
  }

  return next();
}

module.exports = {
  requireOrgAdmin
};
