/**
 * Release 1.2 — Unified organization configuration assembly.
 */

const { createOrganizationProfile } = require("./OrganizationProfile");
const { createBranding } = require("./OrganizationBranding");
const { createDefaultPolicies } = require("./OrganizationPolicies");
const { createDefaultSettings } = require("./OrganizationSettings");
const { createDefaultConnectors } = require("./OrganizationConnectors");
const { brandingForPackage } = require("./OrganizationBranding");
const { policiesForPackage } = require("./OrganizationPolicies");
const { resolveOfficeForPackage } = require("./OrganizationLocations");
const { buildPackageConfiguration } = require("./OrganizationPackages");

function createOrganizationConfiguration(input = {}) {
  const profile = createOrganizationProfile(input.profile || input);

  return {
    id: profile.id,
    profile,
    branding: createBranding(input.branding || {}),
    locations: [],
    users: [],
    packages: [],
    connectors: createDefaultConnectors(),
    policies: createDefaultPolicies(input.policies || {}),
    settings: createDefaultSettings({
      languages: input.profile?.supportedLanguages || input.supportedLanguages,
      timeZone: input.profile?.timeZone || input.timeZone,
      ...input.settings
    }),
    version: 1,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

function assembleRuntimeContext(orgRecord, options = {}) {
  const office = resolveOfficeForPackage(orgRecord.locations, options.officeId);

  return {
    organizationId: orgRecord.id,
    profile: orgRecord.profile,
    branding: brandingForPackage(orgRecord.branding),
    office,
    policies: policiesForPackage(orgRecord.policies),
    settings: orgRecord.settings,
    connectors: orgRecord.connectors,
    workflowName: orgRecord.settings?.workflowDefaults?.defaultWorkflowName || null
  };
}

function resolvePackageRuntimeConfiguration(orgRecord, packageId) {
  return buildPackageConfiguration(orgRecord, packageId);
}

module.exports = {
  createOrganizationConfiguration,
  assembleRuntimeContext,
  resolvePackageRuntimeConfiguration
};
