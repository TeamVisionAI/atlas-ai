const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { listActiveOrganizationUsers } = require("../services/atlasUserService");
const { resolveDefaultInterviewAssignment } = require("../core/interviewAssignmentEngine");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

router.get("/candidates", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const users = await listActiveOrganizationUsers(organizationId);
    const defaultAssignment = await resolveDefaultInterviewAssignment(req.atlasUser);

    res.json({
      defaultInterviewer: defaultAssignment,
      candidates: users
    });
  } catch (error) {
    res.status(500).json({
      error: "INTERVIEW_ASSIGNMENT_CANDIDATES_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
