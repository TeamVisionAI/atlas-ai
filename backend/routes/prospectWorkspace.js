/**
 * Sprint 10.2a — Prospect Workspace routes.
 * Sprint 19.1 — Organization-scoped tenant isolation.
 */

const express = require("express");
const {
  buildProspectWorkspaceForRequest
} = require("../application/prospectWorkspaceApplicationService");
const {
  listProspectActivityFeed
} = require("../core/prospectActivityFeedReadModel");
const {
  updateProspectCommunicationLanguage
} = require("../core/prospectWorkspaceProfileEngine");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireLegacyProspectAccess } = require("../middleware/requireProspectAccess");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function rejectSimulatorProspect(phone, res) {
  if (!isProductionProspect(phone)) {
    res.status(404).json({ error: "Prospect workspace not found" });
    return true;
  }

  return false;
}

router.get("/:phone/activity", requireLegacyProspectAccess(), async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const types = req.query.types
      ? String(req.query.types)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined;

    const feed = await listProspectActivityFeed(req.params.phone, {
      limit: req.query.limit,
      cursor: req.query.cursor,
      types
    });

    res.json(feed);
  } catch (error) {
    console.error("[prospect-workspace/activity]", error.message);
    res.status(500).json({ error: "Failed to load activity feed" });
  }
});

router.get("/:phone", requireLegacyProspectAccess(), async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const data = await buildProspectWorkspaceForRequest(req, req.params.phone);

    if (!data) {
      return res.status(404).json({ error: "Prospect workspace not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("[prospect-workspace]", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.patch(
  "/:phone/communication-language",
  requireLegacyProspectAccess({ write: true }),
  async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const result = await updateProspectCommunicationLanguage(
      req.params.phone,
      req.body?.communication_language
    );

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    res.json(result.body);
  } catch (error) {
    console.error("[prospect-workspace/profile]", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
