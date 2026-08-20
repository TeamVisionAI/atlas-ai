/**
 * C1 — Tenant recruiting configuration persistence.
 * Canonical store: organization_settings.settings.recruiting
 * Does not use DEFAULT_ORGANIZATION_ID fallback.
 */

const { supabase } = require("./supabaseService");
const { writeAuditLog } = require("../security/auditLogService");
const {
  CONFIG_SOURCES,
  cloneTeamVisionRecruitingDefault,
  mergeRecruitingConfig,
  validateRecruitingConfig
} = require("../core/recruitingConfig");
const { assertCannotMutateSeedFromOtherTenant } = require("../core/teamVisionSeedTenant");

let persistence = null;

function requireOrganizationId(organizationId) {
  if (!organizationId || typeof organizationId !== "string" || !organizationId.trim()) {
    const error = new Error("organizationId is required.");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }
  return organizationId.trim();
}

function defaultPersistence() {
  return {
    async loadSettings(organizationId) {
      const { data, error } = await supabase
        .from("organization_settings")
        .select("settings")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.settings || null;
    },

    async saveRecruiting(organizationId, recruiting) {
      const current = (await this.loadSettings(organizationId)) || {};
      const nextSettings = {
        ...current,
        recruiting
      };

      const { error } = await supabase.from("organization_settings").upsert(
        {
          organization_id: organizationId,
          settings: nextSettings,
          updated_at: new Date().toISOString()
        },
        { onConflict: "organization_id" }
      );

      if (error) {
        throw error;
      }

      return nextSettings;
    }
  };
}

function getPersistence() {
  return persistence || defaultPersistence();
}

function setRecruitingConfigPersistenceForTests(override) {
  persistence = override;
}

function hasPersistedRecruiting(settings) {
  return Boolean(settings && typeof settings === "object" && settings.recruiting);
}

async function getRecruitingConfig(organizationId) {
  const orgId = requireOrganizationId(organizationId);
  const settings = await getPersistence().loadSettings(orgId);

  if (!hasPersistedRecruiting(settings)) {
    return {
      organizationId: orgId,
      source: CONFIG_SOURCES.DEFAULT_TEMPLATE,
      persisted: false,
      // BR-146 — clone defaults only; never write back to the Team Vision seed tenant.
      config: cloneTeamVisionRecruitingDefault()
    };
  }

  return {
    organizationId: orgId,
    source: CONFIG_SOURCES.PERSISTED,
    persisted: true,
    config: structuredClone(settings.recruiting)
  };
}

async function updateRecruitingConfig(organizationId, patch, actor = {}) {
  const orgId = requireOrganizationId(organizationId);
  assertCannotMutateSeedFromOtherTenant(orgId, actor.organizationId);
  if (patch && typeof patch === "object") {
    if (patch.organizationId != null || patch.organization_id != null) {
      const error = new Error("organizationId cannot be supplied in the recruiting config body.");
      error.statusCode = 400;
      error.publicCode = "ORGANIZATION_ID_NOT_ALLOWED";
      throw error;
    }
  }

  const current = await getRecruitingConfig(orgId);
  const merged = mergeRecruitingConfig(current.config, patch);
  validateRecruitingConfig(merged);

  await getPersistence().saveRecruiting(orgId, merged);

  await writeAuditLog({
    organizationId: orgId,
    userId: actor.userId,
    userEmail: actor.userEmail,
    action: "organization.recruiting_config_updated",
    targetType: "organization_settings",
    targetId: orgId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      schemaVersion: merged.schemaVersion,
      previousSource: current.source
    }
  });

  return {
    organizationId: orgId,
    source: CONFIG_SOURCES.PERSISTED,
    persisted: true,
    config: merged
  };
}

module.exports = {
  getRecruitingConfig,
  updateRecruitingConfig,
  setRecruitingConfigPersistenceForTests,
  requireOrganizationId
};
