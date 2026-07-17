const express = require("express");
const router = express.Router();
const { getMissionControlState } = require("../controllers/conversationController");

router.get("/:phone", async (req, res) => {
  try {
    const data = await getMissionControlState(req.params.phone);

    if (!data) {
      return res.status(404).json({ error: "No active conversation found" });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
