/**
 * BR-074 — Re-evaluate firm-verified securities content access on every request.
 */

const {
  canAccessSecuritiesContent,
  getSecuritiesAccessSummary,
  recordContentAccessDenied
} = require("../security/securitiesAccessService");

function requireSecuritiesContentAccess(options = {}) {
  return async function securitiesContentAccessMiddleware(req, res, next) {
    try {
      const context = req.authContext;

      if (!context) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const allowed = await canAccessSecuritiesContent(context, {
        requiredProductScope: options.requiredProductScope || null,
        requiredPrincipalScope: options.requiredPrincipalScope || null
      });

      if (!allowed) {
        const summary = await getSecuritiesAccessSummary(context);
        await recordContentAccessDenied(req, {
          resource: options.resource || req.path,
          status: summary.securities_access_status
        });

        return res.status(403).json({
          error: "SECURITIES_ACCESS_DENIED",
          message:
            "Firm-verified active securities authorization is required for this content.",
          securities_access_status: summary.securities_access_status
        });
      }

      req.securitiesAccessAllowed = true;
      return next();
    } catch (error) {
      console.error("[requireSecuritiesContentAccess]", error.message);
      return res.status(500).json({
        error: "SECURITIES_ACCESS_ERROR",
        message: "Unable to evaluate securities access."
      });
    }
  };
}

module.exports = {
  requireSecuritiesContentAccess
};
