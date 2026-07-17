const express = require("express");
const { evaluateCandidate } = require("../core/recruitingEngine");

const router = express.Router();

router.post("/", (req, res) => {
  const result = evaluateCandidate(req.body);

  res.json({
    success: true,
    result
  });
});

module.exports = router;