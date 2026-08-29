const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireAnyPermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  createAgendaContact,
  listAgendaContacts,
  createStandaloneAppointment,
  recordStandaloneOutcome
} = require("../application/agendaApplicationService");

const router = express.Router();
router.use(requireAtlasUser);
router.use(organizationGuard());
router.use(requireAnyPermission(PERMISSIONS.PROSPECT_READ, PERMISSIONS.PROSPECT_WRITE));

function context(req) {
  const organizationId = getTenantOrganizationId(req);
  const userId = req.tenantContext?.userId || req.authContext?.userId || req.user?.id || null;
  if (!organizationId || !userId) {
    const error = new Error("Tenant user context is required.");
    error.statusCode = 403;
    error.code = "TENANT_CONTEXT_REQUIRED";
    throw error;
  }
  return { organizationId, userId };
}

function sendError(res, error) {
  return res.status(error.statusCode || error.status || 500).json({
    success: false,
    error: error.code || "AGENDA_FAILED",
    message: error.message
  });
}

router.get("/contacts", async (req, res) => {
  try {
    const items = await listAgendaContacts(context(req), {
      status: req.query.status || null,
      limit: req.query.limit || 100
    });
    return res.json({ items, total: items.length });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/contacts", requireAnyPermission(PERMISSIONS.PROSPECT_WRITE), async (req, res) => {
  try {
    const contact = await createAgendaContact(req.body || {}, context(req));
    return res.status(201).json({ success: true, contact });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/appointments", requireAnyPermission(PERMISSIONS.PROSPECT_WRITE), async (req, res) => {
  try {
    const result = await createStandaloneAppointment(req.body || {}, context(req));
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post(
  "/appointments/:id/outcome",
  requireAnyPermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      const appointment = await recordStandaloneOutcome(
        req.params.id,
        req.body || {},
        context(req)
      );
      return res.json({ success: true, appointment });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

module.exports = router;
