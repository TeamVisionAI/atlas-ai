const express = require("express");
const { getCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { requirePermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");

const router = express.Router();

router.use(requireAtlasUser);
router.use(requirePermission(PERMISSIONS.DASHBOARD_EXECUTIVE));

router.get("/summary", (req, res) => {
  try {
    const { executiveDashboardService } = getCommunicationGateway();
    res.json(executiveDashboardService.getSummary());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
