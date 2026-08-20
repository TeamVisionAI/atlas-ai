/**
 * BR-146 — Team Vision is the permanent Atlas seed tenant.
 * Automatic lifecycle, deletion, archive, and reset must fail closed.
 * Child tenants may clone Team Vision defaults; they must never write Team Vision.
 */

const TEAM_VISION_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

const SEED_DESTRUCTIVE_ACTIONS = Object.freeze(["delete", "archive", "reset"]);

function isTeamVisionSeedTenant(organizationId) {
  return String(organizationId || "").trim() === TEAM_VISION_ORGANIZATION_ID;
}

function seedTenantProtectionError(action) {
  const error = new Error(
    `Team Vision seed tenant cannot be ${action}. Organization ${TEAM_VISION_ORGANIZATION_ID} is permanent.`
  );
  error.statusCode = 403;
  error.publicCode = "SEED_TENANT_PROTECTED";
  error.action = action;
  return error;
}

function assertTeamVisionNotDestructible(organizationId, action = "delete") {
  const normalizedAction = String(action || "delete").trim().toLowerCase();

  if (!isTeamVisionSeedTenant(organizationId)) {
    return;
  }

  throw seedTenantProtectionError(
    SEED_DESTRUCTIVE_ACTIONS.includes(normalizedAction) ? normalizedAction : "mutated"
  );
}

function assertCannotMutateSeedFromOtherTenant(targetOrganizationId, actorOrganizationId) {
  if (!isTeamVisionSeedTenant(targetOrganizationId)) {
    return;
  }

  if (!actorOrganizationId || isTeamVisionSeedTenant(actorOrganizationId)) {
    return;
  }

  throw seedTenantProtectionError("mutated by another tenant");
}

function shouldSkipAutomaticTrialExpiry(organizationId) {
  return isTeamVisionSeedTenant(organizationId);
}

module.exports = {
  TEAM_VISION_ORGANIZATION_ID,
  SEED_DESTRUCTIVE_ACTIONS,
  isTeamVisionSeedTenant,
  assertTeamVisionNotDestructible,
  assertCannotMutateSeedFromOtherTenant,
  shouldSkipAutomaticTrialExpiry
};
