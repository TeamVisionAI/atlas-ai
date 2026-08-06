/**
 * BR-080 — Acknowledge / Claim new leads (thin API).
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const supabaseService = require("../services/supabaseService");
const {
  acknowledgeLead,
  claimLead,
  canAcknowledgeProspect,
  canClaimUnassigned
} = require("../core/newLeadAttentionEngine");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function actorFromRequest(req) {
  return {
    userId: req.authContext?.userId || null,
    userEmail: req.authContext?.email || req.user?.email || null
  };
}

async function loadOrgProspect(req, phone) {
  const organizationId = getTenantOrganizationId(req);
  const prospect = await supabaseService.findProspectInOrganization(phone, organizationId);
  return { organizationId, prospect };
}

router.post("/:phone/acknowledge", async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone || "");
    const { prospect } = await loadOrgProspect(req, phone);

    if (!prospect) {
      return res.status(404).json({ error: "Prospect not found", code: "NOT_FOUND" });
    }

    if (!canAcknowledgeProspect(req.authContext, prospect)) {
      return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    }

    const result = await acknowledgeLead(prospect, actorFromRequest(req));
    return res.json({
      ok: true,
      alreadyAcknowledged: result.alreadyAcknowledged,
      prospect: {
        phone: result.prospect.phone,
        prospectNumber: result.prospect.prospect_number || null,
        ownerUserId: result.prospect.owner_user_id || null,
        attentionStatus: result.prospect.attention_status || null,
        acknowledgedAt: result.prospect.acknowledged_at || null,
        assignmentStatus: result.prospect.assignment_status || null
      }
    });
  } catch (error) {
    console.error("[new-lead-attention/acknowledge]", error.message);
    return res.status(error.statusCode || 500).json({
      error: error.message || "Failed to acknowledge lead",
      code: error.publicCode || "ACKNOWLEDGE_FAILED"
    });
  }
});

router.post("/:phone/claim", async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone || "");
    const { prospect } = await loadOrgProspect(req, phone);

    if (!prospect) {
      return res.status(404).json({ error: "Prospect not found", code: "NOT_FOUND" });
    }

    if (!canClaimUnassigned(req.authContext, prospect)) {
      return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    }

    const result = await claimLead(prospect, actorFromRequest(req));
    return res.json({
      ok: true,
      claimed: result.claimed,
      prospect: {
        phone: result.prospect.phone,
        prospectNumber: result.prospect.prospect_number || null,
        ownerUserId: result.prospect.owner_user_id || null,
        attentionStatus: result.prospect.attention_status || null,
        acknowledgedAt: result.prospect.acknowledged_at || null,
        assignmentStatus: result.prospect.assignment_status || "assigned"
      }
    });
  } catch (error) {
    console.error("[new-lead-attention/claim]", error.message);
    return res.status(error.statusCode || 500).json({
      error: error.message || "Failed to claim lead",
      code: error.publicCode || "CLAIM_FAILED"
    });
  }
});

module.exports = router;
