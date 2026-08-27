/**
 * BR-163 — Tenant-scoped printable prospect report.
 * Reuses Prospect Center + authorization filters. No tenant hardcoding.
 */

const { isSuperAdmin } = require("../security/saasRoles");
const { filterProspectsForAuthContext } = require("../security/authorizationService");

const REPORT_LIFECYCLES = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
  ALL: "all"
});

function emptyControlPlane(organizationId) {
  return {
    generatedAt: new Date().toISOString(),
    organizationId: organizationId || null,
    emptyReason: "SUPER_ADMIN_CONTROL_PLANE",
    totalCount: 0,
    filteredCount: 0,
    items: []
  };
}

function isProspectArchived(prospect = {}) {
  const workflowState = prospect.workflow_state || {};
  return Boolean(
    prospect.archived_at ||
      prospect.is_archived ||
      workflowState.inboxArchivedAt ||
      workflowState.inboxWindowExpiredAt ||
      workflowState.inboxClosedAt
  );
}

function matchesReportFilters(item, filters = {}) {
  if (filters.lifecycle === REPORT_LIFECYCLES.ARCHIVED && !item.archived) {
    return false;
  }
  if (filters.lifecycle === REPORT_LIFECYCLES.ACTIVE && item.archived) {
    return false;
  }
  if (filters.ownerUserId && String(item.ownerUserId || "") !== String(filters.ownerUserId)) {
    return false;
  }
  if (
    filters.milestone &&
    String(item.canonicalMilestone || item.currentStep || "").toUpperCase() !==
      String(filters.milestone).toUpperCase()
  ) {
    return false;
  }
  if (filters.source) {
    const haystack = `${item.source || ""} ${item.entryMethod || ""}`.toLowerCase();
    if (!haystack.includes(String(filters.source).toLowerCase())) {
      return false;
    }
  }
  if (
    filters.appointmentStatus &&
    String(item.appointmentStatus || "").toLowerCase() !==
      String(filters.appointmentStatus).toLowerCase()
  ) {
    return false;
  }
  if (filters.dateFrom || filters.dateTo) {
    const activityMs = Date.parse(item.lastActivityAt || item.interviewAt || "");
    if (!Number.isFinite(activityMs)) {
      return false;
    }
    if (filters.dateFrom && activityMs < Date.parse(filters.dateFrom)) {
      return false;
    }
    if (filters.dateTo && activityMs > Date.parse(filters.dateTo) + 24 * 60 * 60 * 1000 - 1) {
      return false;
    }
  }
  return true;
}

function fallbackSummary(prospect) {
  return {
    phone: prospect.phone,
    name: prospect.name || null,
    currentStep: prospect.current_step || null,
    canonicalMilestone: prospect.current_step || null
  };
}

function toReportCenterItem(prospect, summary, appointment) {
  return {
    phone: summary.phone || prospect.phone,
    name: summary.name || prospect.name || null,
    prospectNumber: prospect.prospect_number || null,
    canonicalMilestone: summary.canonicalMilestone || prospect.current_step || null,
    currentStep: summary.currentStep || prospect.current_step || null,
    ownerUserId: prospect.owner_user_id || null,
    source: prospect.source || null,
    entryMethod: prospect.entry_method || null,
    city: prospect.city || null,
    state: prospect.state || null,
    communicationLanguage: prospect.communication_language || null,
    appointmentStatus: appointment?.status || null,
    interviewAt: appointment?.startDateTime || null
  };
}

function toReportRow(item, ownerNames = new Map()) {
  return {
    prospectId: item.prospectNumber || item.id || null,
    name: item.name || null,
    phone: item.phone || null,
    status: item.canonicalMilestone || item.currentStep || null,
    owner: ownerNames.get(item.ownerUserId) || item.ownerUserId || null,
    source: item.source || item.entryMethod || null,
    city: item.city || null,
    state: item.state || null,
    language: item.communicationLanguage || null,
    appointmentStatus: item.appointmentStatus || null,
    appointmentAt: item.interviewAt || null,
    lastActivityAt: item.lastActivityAt || null
  };
}

function toCsv(rows = []) {
  const headers = [
    "Prospect ID",
    "Name",
    "Phone",
    "Status",
    "Owner",
    "Source",
    "City",
    "State",
    "Language",
    "Appointment status",
    "Appointment date/time",
    "Last activity"
  ];
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  return [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.prospectId,
        row.name,
        row.phone,
        row.status,
        row.owner,
        row.source,
        row.city,
        row.state,
        row.language,
        row.appointmentStatus,
        row.appointmentAt,
        row.lastActivityAt
      ]
        .map(escape)
        .join(",")
    )
  ].join("\n");
}

async function resolveOwnerNames(userIds = []) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) {
    return new Map();
  }
  try {
    const { supabase } = require("../services/supabaseService");
    const { data } = await supabase
      .from("atlas_users")
      .select("id, display_name, first_name, last_name")
      .in("id", unique);
    return new Map(
      (data || []).map((user) => [
        user.id,
        user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.id
      ])
    );
  } catch {
    return new Map();
  }
}

/**
 * @param {{
 *   organizationId: string,
 *   authContext: object,
 *   supportModeActive?: boolean,
 *   filters?: object,
 *   limit?: number,
 *   offset?: number
 * }} options
 */
async function buildProspectReport(options = {}) {
  const organizationId = String(options.organizationId || "").trim();
  if (!organizationId) {
    const error = new Error("organizationId is required for the prospect report");
    error.statusCode = 403;
    error.code = "PROSPECT_REPORT_ORG_REQUIRED";
    throw error;
  }

  if (isSuperAdmin(options.authContext?.saasRole) && options.supportModeActive !== true) {
    return emptyControlPlane(organizationId);
  }

  const productionProspects =
    options.prospects ||
    (await require("./executiveDashboardReadModel").loadProductionProspects(organizationId));
  const scoped = filterProspectsForAuthContext(
    options.authContext,
    productionProspects.filter((row) => String(row.organization_id || "") === organizationId)
  );
  const summaries = options.summaries
    ? options.summaries
    : options.prospects
      ? scoped.map(fallbackSummary)
      : await Promise.all(
          scoped.map((row) =>
            require("./missionControlPriorityEngine").buildWorkflowSummaryForProspect(row)
          )
        );
  const byPhone = new Map(scoped.map((row) => [row.phone, row]));
  const appointmentList =
    options.appointments ||
    (await require("../services/appointmentListService").listPersistedAppointments({
      organizationId
    }));
  const appointmentByPhone = new Map(
    (appointmentList.items || []).map((appointment) => [appointment.prospectPhone, appointment])
  );

  let items = summaries
    .filter(Boolean)
    .map((summary) => {
      const prospect = byPhone.get(summary.phone);
      if (!prospect) {
        return null;
      }
      const appointment = appointmentByPhone.get(prospect.phone);
      const center = toReportCenterItem(prospect, summary, appointment);
      return {
        ...center,
        id: prospect.id || null,
        archived: isProspectArchived(prospect),
        lastActivityAt:
          prospect.last_message_at || prospect.updated_at || prospect.created_at || null,
        appointmentStatus: appointment?.status || center.appointmentStatus || null,
        interviewAt: appointment?.startDateTime || center.interviewAt || null
      };
    })
    .filter(Boolean)
    .filter((item) => matchesReportFilters(item, options.filters || {}));

  const ownerNames =
    options.ownerNames || (await resolveOwnerNames(items.map((item) => item.ownerUserId)));
  const rows = items.map((item) => toReportRow(item, ownerNames));
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.min(5000, Math.max(1, Number(options.limit) || 100));

  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    emptyReason: null,
    totalCount: rows.length,
    filteredCount: rows.length,
    items: options.forExport ? rows : rows.slice(offset, offset + limit),
    offset,
    limit
  };
}

module.exports = {
  REPORT_LIFECYCLES,
  buildProspectReport,
  matchesReportFilters,
  isProspectArchived,
  toReportRow,
  toCsv,
  emptyControlPlane
};
