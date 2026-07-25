const express = require("express");
const { intakeFacebookLead } = require("../core/facebookLeadIntakeService");
const { requireInternalServiceSecret } = require("../middleware/requireInternalServiceSecret");

const router = express.Router();

router.post("/facebook-lead", requireInternalServiceSecret, async (req, res) => {
  try {
    const result = await intakeFacebookLead(req.body || {});

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error("[recruiting/facebook-lead]", error);
    res.status(500).json({
      success: false,
      error: "FACEBOOK_LEAD_INTAKE_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
