/**
 * Release 1.2 — Organization Console exports.
 */

const { OrganizationEvent } = require("./OrganizationEvents");
const organizationStore = require("./OrganizationStore");
const {
  createOrganizationProfile,
  updateOrganizationProfile
} = require("./OrganizationProfile");
const { createBranding, updateBranding, brandingForPackage } = require("./OrganizationBranding");
const {
  createOffice,
  addOffice,
  updateOffice,
  findOffice,
  resolveOfficeForPackage
} = require("./OrganizationLocations");
const { createUser, addUser, updateUser, findUserByEmail } = require("./OrganizationUsers");
const { DEFAULT_ROLES, listRoles, getRole, roleHasPermission } = require("./OrganizationRoles");
const {
  SUPPORTED_PACKAGES,
  installPackage,
  uninstallPackage,
  setPackageEnabled,
  configurePackage,
  getInstalledPackage,
  buildPackageConfiguration
} = require("./OrganizationPackages");
const {
  CONNECTOR_IDS,
  createDefaultConnectors,
  configureConnector,
  enabledConnectors
} = require("./OrganizationConnectors");
const {
  createDefaultPolicies,
  updatePolicies,
  policiesForPackage
} = require("./OrganizationPolicies");
const { createDefaultSettings, updateSettings } = require("./OrganizationSettings");
const {
  createOrganizationConfiguration,
  assembleRuntimeContext,
  resolvePackageRuntimeConfiguration
} = require("./OrganizationConfiguration");
const { validateConfiguration } = require("./ConfigurationValidator");
const {
  OrganizationRegistry,
  getOrganizationRegistry,
  resetOrganizationRegistry
} = require("./OrganizationRegistry");
const { OrganizationManager, createOrganizationManager } = require("./OrganizationManager");
const { recalculateAnalytics, getAnalytics } = require("./OrganizationAnalytics");

module.exports = {
  OrganizationEvent,
  organizationStore,
  createOrganizationProfile,
  updateOrganizationProfile,
  createBranding,
  updateBranding,
  brandingForPackage,
  createOffice,
  addOffice,
  updateOffice,
  findOffice,
  resolveOfficeForPackage,
  createUser,
  addUser,
  updateUser,
  findUserByEmail,
  DEFAULT_ROLES,
  listRoles,
  getRole,
  roleHasPermission,
  SUPPORTED_PACKAGES,
  installPackage,
  uninstallPackage,
  setPackageEnabled,
  configurePackage,
  getInstalledPackage,
  buildPackageConfiguration,
  CONNECTOR_IDS,
  createDefaultConnectors,
  configureConnector,
  enabledConnectors,
  createDefaultPolicies,
  updatePolicies,
  policiesForPackage,
  createDefaultSettings,
  updateSettings,
  createOrganizationConfiguration,
  assembleRuntimeContext,
  resolvePackageRuntimeConfiguration,
  validateConfiguration,
  OrganizationRegistry,
  getOrganizationRegistry,
  resetOrganizationRegistry,
  OrganizationManager,
  createOrganizationManager,
  recalculateAnalytics,
  getAnalytics
};
