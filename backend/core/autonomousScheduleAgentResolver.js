/**
 * Resolve appointment owner/agent for autonomous WhatsApp scheduling.
 * Does not require a browser-authenticated session.
 * Never falls back to support/administrator accounts.
 */

const supabaseService = require("../services/supabaseService");
const atlasUserService = require("../services/atlasUserService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

const { supabase } = supabaseService;

const SUPPORT_ADMIN_EMAILS = new Set([
  "support@teamvisionfinancial.com",
  "admin@teamvision.ai"
]);

function isEligibleScheduleAgent(user) {
  if (!user?.id) {
    return false;
  }

  const status = String(user.status || "active").toLowerCase();
  if (status && status !== "active") {
    return false;
  }

  const email = String(user.email || "").trim().toLowerCase();
  if (SUPPORT_ADMIN_EMAILS.has(email)) {
    return false;
  }

  const role = String(user.role || "").toLowerCase();
  // Prefer operating recruiters/RVPs; never treat pure operations as schedule owners.
  if (role === "operations") {
    return false;
  }

  return true;
}

async function loadOrganizationSettingsRow(organizationId) {
  if (!organizationId) {
    return null;
  }

  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    logWhatsAppStage("autonomous_schedule_org_settings_failed", {
      level: "warn",
      error: error.message,
      organizationId
    });
    return null;
  }

  return data?.settings || null;
}

function readConfiguredDefaultRecruiterId(settings) {
  if (!settings || typeof settings !== "object") {
    return null;
  }

  const candidates = [
    settings.scheduling?.defaultRecruiterUserId,
    settings.scheduling?.default_recruiter_user_id,
    settings.policies?.defaultRecruiterUserId,
    settings.policies?.leadDistribution?.defaultRecruiterUserId,
    settings.defaultRecruiterUserId
  ];

  for (const value of candidates) {
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }

  return null;
}

async function findActiveOrganizationRvp(organizationId) {
  if (!organizationId) {
    return null;
  }

  // Prefer known Team Vision operating RVP when present.
  const preferred = await atlasUserService
    .findUserByRepId("4TJLK", organizationId)
    .catch(() => null);
  if (preferred && isEligibleScheduleAgent(preferred)) {
    return preferred;
  }

  let query = supabase
    .from("atlas_users")
    .select("id, email, role, rep_id, status, organization_id, display_name")
    .eq("organization_id", organizationId)
    .eq("role", "rvp");

  // status filter is best-effort; some environments omit status chaining in mocks/tests.
  if (typeof query.eq === "function") {
    query = query.eq("status", "active");
  }

  const { data, error } = await query.order("created_at", { ascending: true }).limit(5);

  if (error) {
    logWhatsAppStage("autonomous_schedule_rvp_lookup_failed", {
      level: "warn",
      error: error.message,
      organizationId
    });
    return null;
  }

  const eligible = (data || []).find((user) => isEligibleScheduleAgent(user));
  return eligible || null;
}

/**
 * @param {object} input
 * @param {object} [input.prospect]
 * @param {string|null} [input.organizationId]
 * @param {object|null} [input.organizationSettings]
 * @returns {Promise<{ agentId: string|null, source: string|null, repId: string|null }>}
 */
async function resolveAutonomousScheduleAgentId(input = {}) {
  const prospect = input.prospect || {};
  const organizationId =
    input.organizationId ||
    prospect.organization_id ||
    prospect.organizationId ||
    DEFAULT_ORGANIZATION_ID;

  const ownerId = prospect.owner_user_id || prospect.ownerUserId || null;
  if (ownerId) {
    const owner = await atlasUserService.findUserById(ownerId).catch(() => null);
    if (owner && isEligibleScheduleAgent(owner)) {
      return {
        agentId: owner.id,
        source: "prospect_owner",
        repId: owner.rep_id || null
      };
    }
  }

  const assignedId =
    prospect.assigned_agent_id ||
    prospect.assignedAgentId ||
    prospect.assigned_rvp_id ||
    prospect.assignedRvpId ||
    null;

  if (assignedId) {
    const assigned = await atlasUserService.findUserById(assignedId).catch(() => null);
    if (assigned && isEligibleScheduleAgent(assigned)) {
      return {
        agentId: assigned.id,
        source: "prospect_assigned_representative",
        repId: assigned.rep_id || null
      };
    }
  }

  const settings =
    input.organizationSettings || (await loadOrganizationSettingsRow(organizationId));
  const configuredDefaultId = readConfiguredDefaultRecruiterId(settings);

  if (configuredDefaultId) {
    const configured = await atlasUserService.findUserById(configuredDefaultId).catch(() => null);
    if (configured && isEligibleScheduleAgent(configured)) {
      return {
        agentId: configured.id,
        source: "organization_default_recruiter",
        repId: configured.rep_id || null
      };
    }
  }

  const rvp = await findActiveOrganizationRvp(organizationId);
  if (rvp) {
    return {
      agentId: rvp.id,
      source: "organization_rvp",
      repId: rvp.rep_id || null
    };
  }

  return {
    agentId: null,
    source: null,
    repId: null
  };
}

function buildSafeScheduleFailureReply(language = "en") {
  if (String(language).toLowerCase().startsWith("es")) {
    return "Lo siento, no pude completar la cita en este momento. Un miembro del equipo te ayudará a confirmar el horario en breve.";
  }

  return "I'm sorry, I couldn't complete the appointment just now. A team member will help you confirm the time shortly.";
}

function isUnsafeCustomerScheduleMessage(message) {
  const text = String(message || "");
  if (!text.trim()) {
    return true;
  }

  return (
    /authenticated agent|appointment persistence|stack|exception|sql|supabase|postgres|ECONN|OAuth|token|organization_id|agent_id|APPOINTMENT_PERSISTENCE|CALENDAR_FAILED|INTERNAL/i.test(
      text
    ) || text.length > 280
  );
}

module.exports = {
  resolveAutonomousScheduleAgentId,
  buildSafeScheduleFailureReply,
  isUnsafeCustomerScheduleMessage,
  isEligibleScheduleAgent,
  readConfiguredDefaultRecruiterId,
  findActiveOrganizationRvp
};
