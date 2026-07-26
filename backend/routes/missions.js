/**
 * Sprint 18.3 — Mission Engine API routes.
 * Mission Control consumes these endpoints — no business logic in routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireLegacyProspectAccess } = require("../middleware/requireProspectAccess");
const { requirePermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");
const {
  listMissions,
  getMission,
  recalculate,
  listProspectMissions
} = require("../controllers/missionController");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/", requirePermission(PERMISSIONS.PROSPECT_READ), listMissions);

router.post(
  "/recalculate",
  requirePermission(PERMISSIONS.PROSPECT_READ),
  recalculate
);

router.get(
  "/prospect/:phone",
  requireLegacyProspectAccess(),
  requirePermission(PERMISSIONS.PROSPECT_READ),
  listProspectMissions
);

router.get("/:id", requirePermission(PERMISSIONS.PROSPECT_READ), getMission);

module.exports = router;
