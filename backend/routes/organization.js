const express = require("express");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");

const router = express.Router();

router.get("/settings", (req, res) => {
  res.json(getOrganizationSettings());
});

module.exports = router;
