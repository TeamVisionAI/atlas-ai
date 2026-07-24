/**
 * Atlas Knowledge Hub API — authenticated read-only /docs access.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const {
  getKnowledgeTree,
  getKnowledgeDocument
} = require("../core/knowledgeHubService");

const router = express.Router();

router.use(requireAtlasUser);

router.get("/tree", async (req, res) => {
  try {
    const payload = getKnowledgeTree();
    res.json(payload);
  } catch (error) {
    console.error("[knowledge/tree]", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "TREE_FAILED",
      message: error.message || "Unable to load documentation tree."
    });
  }
});

router.get("/document", async (req, res) => {
  try {
    const documentPath = req.query.path;

    if (!documentPath) {
      return res.status(400).json({
        error: "PATH_REQUIRED",
        message: "Query parameter path is required."
      });
    }

    const payload = getKnowledgeDocument(documentPath);
    res.json(payload);
  } catch (error) {
    console.error("[knowledge/document]", error.message);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.publicCode || "DOCUMENT_FAILED",
        message: error.message
      });
    }

    res.status(500).json({
      error: "DOCUMENT_FAILED",
      message: "Unable to load documentation."
    });
  }
});

module.exports = router;
