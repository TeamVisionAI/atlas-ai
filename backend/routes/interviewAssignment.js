const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { listAssignableRepresentatives } = require("../core/personnelDirectoryEngine");
const { resolveDefaultInterviewAssignment } = require("../core/interviewAssignmentEngine");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/candidates", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const representatives = await listAssignableRepresentatives({ organizationId });
    const defaultAssignment = await resolveDefaultInterviewAssignment(req.atlasUser);

    res.json({
      defaultInterviewer: defaultAssignment,
      candidates: representatives.map((representative) => ({
        id: representative.id,
        display_name: representative.displayName,
        role: representative.role,
        avatarUrl: representative.avatarUrl,
        isAvailable: representative.isAvailable,
        workload: representative.workload,
        interviewEligible: representative.interviewEligible
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: "INTERVIEW_ASSIGNMENT_CANDIDATES_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
