/**
 * Sprint 18.3 / Sprint 19 — Mission Engine API controller.
 * Thin layer — delegates all decisions to missionEngine.
 */

const {
  generateMissionsForOrganization,
  getMissionById,
  recalculateMissions,
  generateMissionsForProspect
} = require("../core/missionEngine");
const { parseMissionId } = require("../core/configuration/missionTypes");
const { getTenantOrganizationId } = require("../services/tenantContextService");

async function listMissions(req, res) {
  try {
    const organizationId = getTenantOrganizationId(req);
    const prospectPhone = req.query.prospectPhone || req.query.phone || null;
    const missions = await generateMissionsForOrganization(organizationId, {
      prospectPhone
    });

    res.json({
      generatedAt: new Date().toISOString(),
      total: missions.length,
      primaryMission: missions[0] || null,
      missions
    });
  } catch (error) {
    console.error("[missions/list]", error.message);
    res.status(500).json({ error: error.message || "MISSIONS_UNAVAILABLE" });
  }
}

async function getMission(req, res) {
  try {
    const organizationId = getTenantOrganizationId(req);
    const mission = await getMissionById(req.params.id, organizationId);

    if (!mission) {
      return res.status(404).json({
        error: "MISSION_NOT_FOUND",
        message: "Mission not found."
      });
    }

    res.json({ mission });
  } catch (error) {
    console.error("[missions/get]", error.message);
    res.status(500).json({ error: error.message || "MISSION_UNAVAILABLE" });
  }
}

async function recalculate(req, res) {
  try {
    const organizationId = getTenantOrganizationId(req);
    const prospectPhone = req.body?.prospectPhone || req.body?.phone || req.query.prospectPhone || null;
    const payload = await recalculateMissions(organizationId, { prospectPhone });

    res.json(payload);
  } catch (error) {
    console.error("[missions/recalculate]", error.message);
    res.status(500).json({ error: error.message || "MISSION_RECALCULATION_FAILED" });
  }
}

async function listProspectMissions(req, res) {
  try {
    const phone = req.params.phone;
    const organizationId = getTenantOrganizationId(req);
    const missions = await generateMissionsForProspect(phone, organizationId);
    const parsed = parseMissionId(missions[0]?.id || "");

    res.json({
      generatedAt: new Date().toISOString(),
      prospectPhone: parsed?.prospectId || phone,
      total: missions.length,
      primaryMission: missions[0] || null,
      missions
    });
  } catch (error) {
    console.error("[missions/prospect]", error.message);
    res.status(500).json({ error: error.message || "MISSIONS_UNAVAILABLE" });
  }
}

module.exports = {
  listMissions,
  getMission,
  recalculate,
  listProspectMissions
};
