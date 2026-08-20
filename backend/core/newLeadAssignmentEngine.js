/**
 * BR-080 — Create-time new lead assignment orchestrator.
 * AI workflow ownership (ATLAS) is never a substitute for CRM owner_user_id.
 */

const atlasUserService = require("../services/atlasUserService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const {
  isEligibleScheduleAgent,
  readConfiguredDefaultRecruiterId,
  findActiveOrganizationRvp
} = require("./autonomousScheduleAgentResolver");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

const ASSIGNMENT_STATUS = Object.freeze({
  ASSIGNED: "assigned",
  UNASSIGNED: "unassigned"
});

const ASSIGNMENT_SOURCES = Object.freeze({
  EXPLICIT: "explicit",
  CAMPAIGN_MAPPING: "campaign_mapping",
  DEFAULT_RECRUITER: "default_recruiter",
  ORGANIZATION_RVP: "organization_rvp",
  CREATOR: "creator",
  UNASSIGNED: "unassigned"
});

function isEligibleNewLeadOwner(user, organizationId) {
  if (!isEligibleScheduleAgent(user)) {
    return false;
  }

  const userOrg = user.organization_id || user.organizationId || null;
  if (
    organizationId &&
    userOrg &&
    String(userOrg) !== String(organizationId)
  ) {
    return false;
  }

  const role = String(user.role || "").toLowerCase();
  if (role === "operations" || role === "support") {
    return false;
  }

  return true;
}

async function tryResolveUser(userId, organizationId) {
  if (!userId) {
    return null;
  }

  const user = await atlasUserService.findUserById(userId).catch(() => null);
  if (!user || !isEligibleNewLeadOwner(user, organizationId)) {
    return null;
  }

  return user;
}

async function loadOrganizationSettings(organizationId, deps = {}) {
  if (deps.organizationSettings) {
    return deps.organizationSettings;
  }

  try {
    const supabaseService = deps.supabaseService || require("../services/supabaseService");
    const { data, error } = await supabaseService.supabase
      .from("organization_settings")
      .select("settings")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      return null;
    }

    return data?.settings || null;
  } catch {
    return null;
  }
}

/**
 * Resolve CRM owner for a new paid/inbound/manual lead.
 * Does not mutate prospects. Does not use ATLAS workflow ownership.
 */
async function resolveNewLeadAssignment({
  organizationId,
  source = null,
  campaignId = null,
  formId = null,
  explicitAgentId = null,
  createdByUserId = null,
  campaignAgentId = null,
  preferCreator = false,
  deps = {}
} = {}) {
  void source;
  void campaignId;
  void formId;

  const orgId = organizationId || DEFAULT_ORGANIZATION_ID;
  const resolvedAt = new Date().toISOString();

  const candidates = [];

  if (explicitAgentId) {
    candidates.push({ id: explicitAgentId, source: ASSIGNMENT_SOURCES.EXPLICIT });
  }

  if (campaignAgentId) {
    candidates.push({
      id: campaignAgentId,
      source: ASSIGNMENT_SOURCES.CAMPAIGN_MAPPING
    });
  }

  if (preferCreator && createdByUserId) {
    candidates.push({ id: createdByUserId, source: ASSIGNMENT_SOURCES.CREATOR });
  }

  const settings = await loadOrganizationSettings(orgId, deps);
  const defaultRecruiterId = readConfiguredDefaultRecruiterId(settings);
  if (defaultRecruiterId) {
    candidates.push({
      id: defaultRecruiterId,
      source: ASSIGNMENT_SOURCES.DEFAULT_RECRUITER
    });
  }

  for (const candidate of candidates) {
    let user = null;

    if (typeof deps.findUserById === "function") {
      user = await deps.findUserById(candidate.id);
      if (user && !isEligibleNewLeadOwner(user, orgId)) {
        user = null;
      }
    } else {
      user = await tryResolveUser(candidate.id, orgId);
    }

    if (user?.id) {
      const result = {
        ownerUserId: user.id,
        assignmentStatus: ASSIGNMENT_STATUS.ASSIGNED,
        assignmentSource: candidate.source,
        fallbackRole: null,
        resolvedAt
      };

      logWhatsAppStage("new_lead_assignment_resolved", {
        organizationId: orgId,
        assignmentSource: result.assignmentSource,
        assignmentStatus: result.assignmentStatus,
        ownerPrefix: String(user.id).slice(0, 8)
      });

      return result;
    }
  }

  const findRvp = deps.findActiveOrganizationRvp || findActiveOrganizationRvp;
  const rvp = await findRvp(orgId);
  if (rvp && isEligibleNewLeadOwner(rvp, orgId)) {
    const result = {
      ownerUserId: rvp.id,
      assignmentStatus: ASSIGNMENT_STATUS.ASSIGNED,
      assignmentSource: ASSIGNMENT_SOURCES.ORGANIZATION_RVP,
      fallbackRole: null,
      resolvedAt
    };

    logWhatsAppStage("new_lead_assignment_resolved", {
      organizationId: orgId,
      assignmentSource: result.assignmentSource,
      assignmentStatus: result.assignmentStatus,
      ownerPrefix: String(rvp.id).slice(0, 8)
    });

    return result;
  }

  // Creator as last eligible attempt when not already preferred (manual paths).
  if (!preferCreator && createdByUserId) {
    const creator = await tryResolveUser(createdByUserId, orgId);
    if (creator) {
      return {
        ownerUserId: creator.id,
        assignmentStatus: ASSIGNMENT_STATUS.ASSIGNED,
        assignmentSource: ASSIGNMENT_SOURCES.CREATOR,
        fallbackRole: null,
        resolvedAt
      };
    }
  }

  logWhatsAppStage("new_lead_left_unassigned", {
    level: "warn",
    organizationId: orgId,
    assignmentStatus: ASSIGNMENT_STATUS.UNASSIGNED
  });

  return {
    ownerUserId: null,
    assignmentStatus: ASSIGNMENT_STATUS.UNASSIGNED,
    assignmentSource: ASSIGNMENT_SOURCES.UNASSIGNED,
    fallbackRole: "admin_rvp_pool",
    resolvedAt
  };
}

function buildNewLeadAttentionFields(assignment, receivedAt = new Date()) {
  const iso =
    receivedAt instanceof Date ? receivedAt.toISOString() : String(receivedAt);

  return {
    owner_user_id: assignment.ownerUserId || null,
    assignment_status: assignment.assignmentStatus,
    assignment_source: assignment.assignmentSource,
    attention_status: "new",
    acknowledged_at: null,
    acknowledged_by_user_id: null,
    human_attention_reason: null,
    new_lead_received_at: iso,
    escalation_level: 0,
    last_escalated_at: null
  };
}

module.exports = {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SOURCES,
  resolveNewLeadAssignment,
  buildNewLeadAttentionFields,
  isEligibleNewLeadOwner
};
