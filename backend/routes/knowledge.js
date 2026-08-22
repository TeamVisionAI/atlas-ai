/**
 * Atlas Knowledge Hub API — authenticated read-only agent reference library.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requirePermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  getKnowledgeTree,
  getKnowledgeDocument
} = require("../core/knowledgeHubService");
const {
  assertKnowledgeHubAccessAsync,
  resolveKnowledgeHubAccessAsync,
  ACCESS_CODES
} = require("../core/knowledgeHub/knowledgeHubAccess");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());
router.use(requirePermission(PERMISSIONS.KNOWLEDGE_READ));

async function requireKnowledgeHubAccess(req, res) {
  try {
    await assertKnowledgeHubAccessAsync({
      userId: req.atlasUser?.id,
      organizationId: getTenantOrganizationId(req),
      authContext: req.authContext
    });
    return true;
  } catch (error) {
    res.status(error.statusCode || 403).json({
      error: error.code || ACCESS_CODES.FORBIDDEN,
      message: error.message,
      reason: error.reason || null
    });
    return false;
  }
}

router.get("/access", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await resolveKnowledgeHubAccessAsync({
      userId: req.atlasUser?.id,
      organizationId,
      authContext: req.authContext
    });
    res.json({
      allowed: result.allowed === true,
      organizationId,
      reason: result.reason || null,
      code: result.code || null,
      managementBypass: result.managementBypass === true,
      featureEnabled: result.feature?.enabled === true,
      globalEnabled: result.feature?.global?.enabled !== false
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.code || "KNOWLEDGE_HUB_ACCESS_FAILED",
      message: "Failed to resolve Knowledge Hub access"
    });
  }
});

router.get("/tree", async (req, res) => {
  if (!(await requireKnowledgeHubAccess(req, res))) {
    return;
  }

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
  if (!(await requireKnowledgeHubAccess(req, res))) {
    return;
  }

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
