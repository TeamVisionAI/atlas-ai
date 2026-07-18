/**
 * Sprint 10.2a — Prospect Workspace routes.
 */

const express = require("express");
const {
  buildProspectWorkspaceReadModel
} = require("../core/prospectWorkspaceReadModel");
const {
  updateProspectCommunicationLanguage
} = require("../core/prospectWorkspaceProfileEngine");
const { isProductionProspect } = require("../core/productionProspectFilter");

const router = express.Router();

function rejectSimulatorProspect(phone, res) {
  if (!isProductionProspect(phone)) {
    res.status(404).json({ error: "Prospect workspace not found" });
    return true;
  }

  return false;
}

router.get("/:phone", async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const data = await buildProspectWorkspaceReadModel(req.params.phone);

    if (!data) {
      return res.status(404).json({ error: "Prospect workspace not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("[prospect-workspace]", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:phone/communication-language", async (req, res) => {
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
