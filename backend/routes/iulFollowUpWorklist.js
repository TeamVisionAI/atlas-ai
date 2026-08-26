/**
 * IUL Follow-Up Worklist routes — print/CSV export with tenant isolation.
 */

const express = require("express");
const {
  buildIulFollowUpWorklistReadModel,
  buildAuthorizedCsv
} = require("../core/iulFollowUpWorklistReadModel");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyIulWorklist
} = require("../core/operationalControlPlane");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/", operationalControlPlaneEmpty(emptyIulWorklist), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await buildIulFollowUpWorklistReadModel({
      organizationId,
      filter: req.query.filter,
      ownerUserId: req.query.owner || null,
      campaign: req.query.campaign || null,
      nearExpiryOnly: req.query.nearExpiry === "1"
    });
    res.json(payload);
  } catch (error) {
    console.error("[iul-follow-up-worklist]", error.message);
    res.status(500).json({ error: "Failed to load IUL follow-up worklist" });
  }
});

router.get("/export.csv", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await buildIulFollowUpWorklistReadModel({
      organizationId,
      filter: req.query.filter,
      ownerUserId: req.query.owner || null,
      campaign: req.query.campaign || null,
      nearExpiryOnly: req.query.nearExpiry === "1"
    });
    const csv = buildAuthorizedCsv(payload, { organizationId });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="iul-follow-up-worklist.csv"'
    );
    res.send(csv);
  } catch (error) {
    console.error("[iul-follow-up-worklist-csv]", error.message);
    res.status(500).json({ error: "Failed to export IUL follow-up worklist" });
  }
});

module.exports = router;
