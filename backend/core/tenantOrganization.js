/**
 * Sprint 19.1 — Resolve tenant organization scope for admin and auth paths.
 * atlas_users remains the LC1.1 source of truth for workspace membership.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { findUserById: findAtlasUserById } = require("../services/atlasUserService");

async function resolveWorkspaceOrganizationId(authContext) {
  const fallback =
    authContext?.organizationId || authContext?.organization_id || DEFAULT_ORGANIZATION_ID;

  if (!authContext?.userId) {
    return fallback;
  }

  const atlasUser = await findAtlasUserById(authContext.userId);

  if (atlasUser?.organization_id) {
    return atlasUser.organization_id;
  }

  return fallback;
}

module.exports = {
  resolveWorkspaceOrganizationId
};
