/**
 * Release 1.2 — Organization Console orchestrator.
 */

const { OrganizationEvent } = require("./OrganizationEvents");
const organizationStore = require("./OrganizationStore");
const { createOrganizationConfiguration, resolvePackageRuntimeConfiguration } =
  require("./OrganizationConfiguration");
const { updateOrganizationProfile } = require("./OrganizationProfile");
const { updateBranding } = require("./OrganizationBranding");
const { addOffice, updateOffice } = require("./OrganizationLocations");
const { addUser, updateUser } = require("./OrganizationUsers");
const { updatePolicies } = require("./OrganizationPolicies");
const { updateSettings } = require("./OrganizationSettings");
const {
  installPackage,
  uninstallPackage,
  setPackageEnabled,
  configurePackage
} = require("./OrganizationPackages");
const { configureConnector } = require("./OrganizationConnectors");
const { validateConfiguration } = require("./ConfigurationValidator");
const { recalculateAnalytics } = require("./OrganizationAnalytics");
const { getOrganizationRegistry } = require("./OrganizationRegistry");

class OrganizationManager {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.registry = deps.registry || getOrganizationRegistry();
  }

  async createOrganization(input) {
    const record = createOrganizationConfiguration(input);
    await this.registry.register(record);
    await recalculateAnalytics();

    this.eventBus?.emit(OrganizationEvent.CREATED, {
      organizationId: record.id,
      profile: record.profile
    });

    return record;
  }

  async getOrganization(organizationId) {
    return this.registry.get(organizationId);
  }

  async updateOrganization(organizationId, patch = {}) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      profile: patch.profile ? updateOrganizationProfile(current.profile, patch.profile) : current.profile,
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.registry.register(updated);
    await organizationStore.appendConfigurationHistory({
      organizationId,
      version: updated.version,
      change: "profile.updated"
    });
    await recalculateAnalytics();

    this.eventBus?.emit(OrganizationEvent.UPDATED, { organizationId });
    return updated;
  }

  async deleteOrganization(organizationId) {
    const deleted = await this.registry.remove(organizationId);

    if (deleted) {
      await recalculateAnalytics();
      this.eventBus?.emit(OrganizationEvent.DELETED, { organizationId });
    }

    return deleted;
  }

  async configureBranding(organizationId, brandingPatch) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      branding: updateBranding(current.branding, brandingPatch),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "branding.updated");
    return updated;
  }

  async addOffice(organizationId, officeInput) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      locations: addOffice(current.locations, officeInput),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "office.created");
    this.eventBus?.emit(OrganizationEvent.OFFICE_CREATED, {
      organizationId,
      office: updated.locations[updated.locations.length - 1]
    });

    return updated;
  }

  async addUser(organizationId, userInput) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      users: addUser(current.users, userInput),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "user.created");
    this.eventBus?.emit(OrganizationEvent.USER_CREATED, {
      organizationId,
      user: updated.users[updated.users.length - 1]
    });

    return updated;
  }

  async updateUser(organizationId, userId, patch) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      users: updateUser(current.users, userId, patch),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "user.updated");
    return updated;
  }

  async configurePolicies(organizationId, policyPatch) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      policies: updatePolicies(current.policies, policyPatch),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "policies.updated");
    return updated;
  }

  async configureSettings(organizationId, settingsPatch) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      settings: updateSettings(current.settings, settingsPatch),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "settings.updated");
    return updated;
  }

  async installPackage(organizationId, packageId, configuration = {}) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      packages: installPackage(current.packages, packageId, configuration),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "package.installed");
    await recalculateAnalytics();

    this.eventBus?.emit(OrganizationEvent.PACKAGE_INSTALLED, {
      organizationId,
      packageId
    });

    return updated;
  }

  async uninstallPackage(organizationId, packageId) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      packages: uninstallPackage(current.packages, packageId),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "package.removed");
    await recalculateAnalytics();

    this.eventBus?.emit(OrganizationEvent.PACKAGE_REMOVED, {
      organizationId,
      packageId
    });

    return updated;
  }

  async setPackageEnabled(organizationId, packageId, enabled) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      packages: setPackageEnabled(current.packages, packageId, enabled),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, enabled ? "package.enabled" : "package.disabled");
    await recalculateAnalytics();
    return updated;
  }

  async configurePackage(organizationId, packageId, configuration) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      packages: configurePackage(current.packages, packageId, configuration),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "package.configured");
    return updated;
  }

  async configureConnector(organizationId, connectorId, patch) {
    const current = await this.requireOrganization(organizationId);
    const updated = {
      ...current,
      connectors: configureConnector(current.connectors, connectorId, patch),
      updatedAt: new Date().toISOString(),
      version: (current.version || 1) + 1
    };

    await this.saveConfiguration(updated, "connector.updated");
    await recalculateAnalytics();
    return updated;
  }

  async validateOrganization(organizationId) {
    const org = await this.requireOrganization(organizationId);
    const result = validateConfiguration(org);

    await organizationStore.appendValidationResult({
      organizationId,
      ...result
    });

    if (!result.valid) {
      this.eventBus?.emit(OrganizationEvent.VALIDATION_FAILED, {
        organizationId,
        errors: result.errors
      });
    }

    return result;
  }

  async getPackageConfiguration(organizationId, packageId) {
    const org = await this.requireOrganization(organizationId);
    return resolvePackageRuntimeConfiguration(org, packageId);
  }

  async requireOrganization(organizationId) {
    const org = await this.registry.get(organizationId);

    if (!org) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    return org;
  }

  async saveConfiguration(record, change) {
    await this.registry.register(record);
    await organizationStore.appendConfigurationHistory({
      organizationId: record.id,
      version: record.version,
      change
    });

    this.eventBus?.emit(OrganizationEvent.CONFIGURATION_CHANGED, {
      organizationId: record.id,
      change,
      version: record.version
    });
  }
}

function createOrganizationManager(options = {}) {
  return new OrganizationManager(options);
}

module.exports = {
  OrganizationManager,
  createOrganizationManager
};
