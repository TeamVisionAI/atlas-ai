const express = require("express");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");

const router = express.Router();

router.use(requireAtlasUser);

router.get("/settings", (req, res) => {
  res.json(getOrganizationSettings());
});

module.exports = router;
