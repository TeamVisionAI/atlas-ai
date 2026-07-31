/**
 * Sprint 12.5.2 — Follow-ups operational queue routes.
 */

const express = require("express");
const { buildFollowUpsReadModel } = require("../core/followUpsReadModel");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await buildFollowUpsReadModel({
      filter: req.query.filter,
      search: req.query.q,
      sort: req.query.sort,
      organizationId
    });

    res.json(payload);
  } catch (error) {
    console.error("[follow-ups]", error.message);
    res.status(500).json({ error: "Failed to load follow-ups queue" });
  }
});

module.exports = router;
