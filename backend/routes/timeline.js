const express = require("express");
const { getConversationTimeline } = require("../services/timelineService");

const router = express.Router();

router.get("/:phone", async (req, res) => {

  try {

    const timeline = await getConversationTimeline(
      req.params.phone
    );

    res.json(timeline);

  } catch (err) {

    console.error(err);
    res.status(500).json({
      error: err.message
    });

  }

});

module.exports = router;