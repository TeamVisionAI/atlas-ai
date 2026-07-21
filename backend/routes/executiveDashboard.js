const express = require("express");
const { getCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");

const router = express.Router();

router.get("/summary", (req, res) => {
  try {
    const { executiveDashboardService } = getCommunicationGateway();
    res.json(executiveDashboardService.getSummary());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
