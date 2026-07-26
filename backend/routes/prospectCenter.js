/**
 * Sprint 10.3 — Prospect Center routes (thin API).
 * Sprint 19 — Tenant-scoped via organizationGuard.
 */

const express = require("express");
const { buildProspectCenterReadModel } = require("../core/prospectCenterReadModel");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await buildProspectCenterReadModel({
      filter: req.query.filter,
      search: req.query.q,
      organizationId
    });

    res.json(payload);
  } catch (error) {
    console.error("[prospect-center]", error.message);
    res.status(500).json({ error: "Failed to load prospect center" });
  }
});

module.exports = router;
