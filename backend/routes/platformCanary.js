"use strict";

const express = require("express");
const { supabase } = require("../services/supabaseService");
const { loadLegacyProspectById } = require("../security/prospectAccessService");
const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
const {
  markConversationAsTest
} = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const { writeAuditLog } = require("../security/auditLogService");

const router = express.Router();

function requestedOrganizationId(req) {
  return String(
    req.query?.organizationId ||
      req.body?.organizationId ||
      req.body?.organization_id ||
      ""
  ).trim();
}

function requireMatchingSupportTenant(req, res) {
  const organizationId = requestedOrganizationId(req);
  const supportOrganizationId = String(req.supportContext?.organizationId || "").trim();

  if (!organizationId) {
    res.status(400).json({
      error: "ORGANIZATION_ID_REQUIRED",
      message: "organizationId is required."
    });
    return null;
  }

  if (!supportOrganizationId) {
    res.status(409).json({
      error: "CANARY_SUPPORT_MODE_REQUIRED",
      message: "Enter Support Mode for the target tenant before using Canary Reset."
    });
    return null;
  }

  if (organizationId !== supportOrganizationId) {
    res.status(403).json({
      error: "CANARY_SUPPORT_TENANT_MISMATCH",
      message: "Canary operations must target the active Support Mode tenant."
    });
    return null;
  }

  return organizationId;
}

function candidateShape(row, workflow = {}) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    prospectNumber: row.prospect_number || null,
    name: row.name || null,
    phone: row.phone || null,
    normalizedPhone: row.normalized_phone || null,
    ownerUserId: row.owner_user_id || null,
    inboxMarkedTestAt: workflow.inboxMarkedTestAt || null,
    canaryAwaitingFreshIntake: workflow.canaryAwaitingFreshIntake === true,
    canaryResetAt: workflow.canaryResetAt || null
  };
}

async function runCandidateQuery(builder) {
  const { data, error } = await builder.limit(20);
  if (error) throw error;
  return data || [];
}

router.get("/canary-candidates", async (req, res) => {
  try {
    const organizationId = requireMatchingSupportTenant(req, res);
    if (!organizationId) return;

    const q = String(req.query?.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({
        error: "CANARY_QUERY_REQUIRED",
        message: "Search requires at least 2 characters."
      });
    }

    const select =
      "id, organization_id, prospect_number, name, phone, normalized_phone, owner_user_id";
    const digits = q.replace(/\D/g, "");
    const rows = [];
    const seen = new Set();
    const add = (list) => {
      for (const row of list || []) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    };

    add(
      await runCandidateQuery(
        supabase
          .from("prospects")
          .select(select)
          .eq("organization_id", organizationId)
          .ilike("prospect_number", `%${q}%`)
      )
    );

    add(
      await runCandidateQuery(
        supabase
          .from("prospects")
          .select(select)
          .eq("organization_id", organizationId)
          .ilike("name", `%${q}%`)
      )
    );

    if (digits.length >= 4) {
      const phoneCandidates = [...new Set([q, digits, `+${digits}`])];
      for (const phone of phoneCandidates) {
        add(
          await runCandidateQuery(
            supabase
              .from("prospects")
              .select(select)
              .eq("organization_id", organizationId)
              .eq("phone", phone)
          )
        );
      }

      add(
        await runCandidateQuery(
          supabase
            .from("prospects")
            .select(select)
            .eq("organization_id", organizationId)
            .eq("normalized_phone", digits)
        )
      );
    }

    const items = [];
    for (const row of rows.slice(0, 20)) {
      const workflow = row.phone
        ? await loadPersistedWorkflowState(row.phone, {
            organizationId,
            prospectId: row.id
          })
        : {};
      items.push(candidateShape(row, workflow || {}));
    }

    res.json({ organizationId, count: items.length, items });
  } catch (error) {
    console.error("[canary-locator] search", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "CANARY_LOCATOR_FAILED",
      message: error.message || "Unable to search canary prospects."
    });
  }
});

router.post("/canary-mark-test", async (req, res) => {
  try {
    const organizationId = requireMatchingSupportTenant(req, res);
    if (!organizationId) return;

    const prospectId = String(req.body?.prospectId || "").trim();
    if (!prospectId) {
      return res.status(400).json({
        error: "PROSPECT_ID_REQUIRED",
        message: "prospectId is required."
      });
    }

    const prospect = await loadLegacyProspectById(prospectId, organizationId);
    if (!prospect) {
      return res.status(404).json({
        error: "CANARY_PROSPECT_NOT_FOUND",
        message: "Prospect not found in the active Support Mode tenant."
      });
    }

    const result = await markConversationAsTest(prospect.phone, {
      organizationId,
      prospectId,
      prospect,
      ownerUserId: prospect.owner_user_id || null
    });

    await writeAuditLog({
      organizationId,
      userId: req.authContext?.userId || null,
      userEmail: req.authContext?.email || null,
      action: "CANARY_MARK_TEST",
      targetType: "prospect",
      targetId: prospectId,
      result: "success",
      metadata: {
        prospect_id: prospectId,
        organization_id: organizationId,
        reason: String(req.body?.reason || "SUPER_ADMIN canary preparation").trim(),
        inbox_marked_test_at: result?.next?.inboxMarkedTestAt || null
      }
    });

    res.json({
      ok: true,
      prospect: candidateShape(prospect, result?.next || {})
    });
  } catch (error) {
    console.error("[canary-locator] mark-test", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "CANARY_MARK_TEST_FAILED",
      message: error.message || "Unable to mark canary prospect as test."
    });
  }
});

module.exports = router;
