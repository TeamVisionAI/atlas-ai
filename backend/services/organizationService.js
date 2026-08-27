/**
 * Sprint 18.2 — Organization configuration service.
 */

const { supabase } = require("./supabaseService");
const { isValidOrganizationLevel } = require("../core/configuration/organizationLevels");
const { writeAuditLog } = require("../security/auditLogService");
const { normalizeInterviewerPool } = require("../core/interviewerPoolEngine");

const DEFAULT_SCHEDULING_SETTINGS = Object.freeze({
  workingHours: { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
  preferredAppointmentHours: { start: "10:00", end: "16:00" },
  maxConcurrentBusinessAppointments: 2,
  allowBusinessOverlap: false,
  respectPersonalCalendar: true
});

const DEFAULT_POLICY_PLACEHOLDERS = Object.freeze({
  sharedRecruiting: { enabled: false },
  leadDistribution: { enabled: false },
  organizationPolicies: {},
  capacityRules: {}
});

async function fetchOrganizationRow(organizationId) {
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, owner_user_id, organization_level, office_name, brand_name, logo_url, primary_color, secondary_color, timezone, is_active, created_at, updated_at"
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFound = new Error("Organization not found.");
    notFound.statusCode = 404;
    throw notFound;
  }

  return data;
}

async function fetchOrganizationSettingsRow(organizationId) {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.settings || {};
}

async function resolveOwnerSummary(ownerUserId) {
  if (!ownerUserId) {
    return null;
  }

  const { data } = await supabase
    .from("atlas_users")
    .select("id, first_name, last_name, email, display_name")
    .eq("id", ownerUserId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.display_name || [data.first_name, data.last_name].filter(Boolean).join(" "),
    email: data.email
  };
}

function normalizeSchedulingSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    workingHours: {
      ...DEFAULT_SCHEDULING_SETTINGS.workingHours,
      ...(source.workingHours || {})
    },
    preferredAppointmentHours: {
      ...DEFAULT_SCHEDULING_SETTINGS.preferredAppointmentHours,
      ...(source.preferredAppointmentHours || {})
    },
    maxConcurrentBusinessAppointments:
      source.maxConcurrentBusinessAppointments ??
      DEFAULT_SCHEDULING_SETTINGS.maxConcurrentBusinessAppointments,
    allowBusinessOverlap:
      source.allowBusinessOverlap ?? DEFAULT_SCHEDULING_SETTINGS.allowBusinessOverlap,
    respectPersonalCalendar:
      source.respectPersonalCalendar ?? DEFAULT_SCHEDULING_SETTINGS.respectPersonalCalendar,
    interviewerPool: normalizeInterviewerPool(source.interviewerPool)
  };
}

async function getOrganizationConfiguration(organizationId) {
  const organization = await fetchOrganizationRow(organizationId);
  const settings = await fetchOrganizationSettingsRow(organizationId);
  const owner = await resolveOwnerSummary(organization.owner_user_id);

  return {
    id: organization.id,
    name: organization.name,
    owner,
    organizationLevel: organization.organization_level || null,
    officeName: organization.office_name || null,
    brandName: organization.brand_name || organization.name,
    logoUrl: organization.logo_url || null,
    primaryColor: organization.primary_color || "#1a365d",
    secondaryColor: organization.secondary_color || "#2b6cb0",
    timezone: organization.timezone || "America/New_York",
    scheduling: normalizeSchedulingSettings(settings.scheduling),
    policies: {
      ...DEFAULT_POLICY_PLACEHOLDERS,
      ...(settings.policies || {})
    }
  };
}

async function getSchedulingSettings(organizationId) {
  const settings = await fetchOrganizationSettingsRow(organizationId);
  return normalizeSchedulingSettings(settings.scheduling);
}

async function updateOrganizationConfiguration(organizationId, input, auditMeta = {}) {
  const organizationPatch = {
    updated_at: new Date().toISOString()
  };

  if (input.name !== undefined) {
    organizationPatch.name = String(input.name).trim();
  }

  if (input.organizationLevel !== undefined) {
    const level = input.organizationLevel || null;

    if (level && !isValidOrganizationLevel(level)) {
      const error = new Error("Invalid organization level.");
      error.statusCode = 400;
      throw error;
    }

    organizationPatch.organization_level = level;
  }

  if (input.officeName !== undefined) {
    organizationPatch.office_name = input.officeName || null;
  }

  if (input.brandName !== undefined) {
    organizationPatch.brand_name = input.brandName || null;
  }

  if (input.logoUrl !== undefined) {
    organizationPatch.logo_url = input.logoUrl || null;
  }

  if (input.primaryColor !== undefined) {
    organizationPatch.primary_color = input.primaryColor || null;
  }

  if (input.secondaryColor !== undefined) {
    organizationPatch.secondary_color = input.secondaryColor || null;
  }

  if (input.timezone !== undefined) {
    organizationPatch.timezone = input.timezone;
  }

  const { data: updatedOrg, error: orgError } = await supabase
    .from("organizations")
    .update(organizationPatch)
    .eq("id", organizationId)
    .select("*")
    .single();

  if (orgError) {
    throw orgError;
  }

  let settingsPatch = null;

  if (input.scheduling !== undefined) {
    const currentSettings = await fetchOrganizationSettingsRow(organizationId);
    settingsPatch = {
      ...currentSettings,
      scheduling: normalizeSchedulingSettings({
        ...normalizeSchedulingSettings(currentSettings.scheduling),
        ...input.scheduling
      })
    };
  }

  if (settingsPatch) {
    const { error: settingsError } = await supabase.from("organization_settings").upsert(
      {
        organization_id: organizationId,
        settings: settingsPatch,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id" }
    );

    if (settingsError) {
      throw settingsError;
    }
  }

  await writeAuditLog({
    organizationId,
    userId: auditMeta.userId,
    userEmail: auditMeta.userEmail,
    action: "configuration.organization_updated",
    targetType: "organization",
    targetId: organizationId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  void updatedOrg;
  return getOrganizationConfiguration(organizationId);
}

async function updateSchedulingSettings(organizationId, input, auditMeta = {}) {
  return updateOrganizationConfiguration(
    organizationId,
    {
      scheduling: input
    },
    auditMeta
  );
}

module.exports = {
  DEFAULT_SCHEDULING_SETTINGS,
  getOrganizationConfiguration,
  getSchedulingSettings,
  updateOrganizationConfiguration,
  updateSchedulingSettings,
  normalizeSchedulingSettings
};
