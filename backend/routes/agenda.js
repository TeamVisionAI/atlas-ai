const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireAnyPermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { listPersistedAppointments } = require("../services/appointmentListService");
const { operationalControlPlaneEmpty, emptyAgenda } = require("../core/operationalControlPlane");
const {
  createAgendaContact,
  listAgendaContacts,
  getAgendaContact,
  createStandaloneAppointment,
  recordStandaloneOutcome,
  promoteToRecruit,
  promoteToClient
} = require("../application/agendaApplicationService");
const {
  planRecovery,
  recoverAgendaOutcome
} = require("../application/agendaOutcomeRecoveryApplicationService");

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

router.get("/recoverable", operationalControlPlaneEmpty(emptyAgenda), async (req, res) => {
  try {
    const scope = context(req);
    const result = await listPersistedAppointments({
      organizationId: scope.organizationId,
      agentId: scope.userId,
      view: "past_unresolved"
    });
    return res.json({ items: result.items || [], total: result.total || 0 });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get("/today", operationalControlPlaneEmpty(emptyAgenda), async (req, res) => {
  try {
    const scope = context(req);
    const result = await listPersistedAppointments({
      organizationId: scope.organizationId,
      agentId: scope.userId,
      view: "today"
    });
    const items = (result.items || []).filter(
      (appointment) => appointment.metadata?.standaloneAgenda === true
    );
    return res.json({ items, total: items.length });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get("/contacts", operationalControlPlaneEmpty(emptyAgenda), async (req, res) => {
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

router.get("/contacts/:id", operationalControlPlaneEmpty(emptyAgenda), async (req, res) => {
  try {
    const contact = await getAgendaContact(req.params.id, context(req));
    return res.json({ success: true, contact });
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

router.post(
  "/appointments/:id/promote-recruit",
  requireAnyPermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      const result = await promoteToRecruit(req.params.id, req.body || {}, context(req));
      return res.json({ success: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.post(
  "/appointments/:id/promote-client",
  requireAnyPermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      const result = await promoteToClient(req.params.id, req.body || {}, context(req));
      return res.json({ success: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.post(
  "/appointments/:id/recover",
  requireAnyPermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      const body = req.body || {};
      const result = await recoverAgendaOutcome(
        req.params.id,
        {
          action: body.action,
          recruiter: body.recruiter || null,
          displayName: body.displayName || null,
          production: body.production || null,
          notes: body.notes || null,
          dryRun: body.dryRun !== false
        },
        context(req)
      );
      return res.json({ success: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.get(
  "/appointments/:id/recover/plan",
  operationalControlPlaneEmpty(emptyAgenda),
  async (req, res) => {
    try {
      const plan = await planRecovery(
        req.params.id,
        {
          action: req.query.action,
          recruiter: {
            userId: req.query.recruiterUserId || null,
            agendaContactId: req.query.recruiterAgendaContactId || null,
            clientId: req.query.recruiterClientId || null,
            displayName: req.query.recruiterDisplayName || null
          },
          displayName: req.query.displayName || null
        },
        context(req)
      );
      return res.json({ success: true, dryRun: true, plan });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

module.exports = router;
