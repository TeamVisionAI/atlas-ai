/**
 * Release 1.2 — Organization package installation and configuration.
 * Atlas Core does not know package internals — only package IDs and opaque config blobs.
 */

const SUPPORTED_PACKAGES = Object.freeze({
  "teamvision-recruiting": {
    packageId: "teamvision-recruiting",
    label: "Team Vision Recruiting Pack",
    dependencies: ["office"]
  }
});

function createPackageRecord(packageId, configuration = {}) {
  const definition = SUPPORTED_PACKAGES[packageId];

  if (!definition) {
    throw new Error(`Unsupported package: ${packageId}`);
  }

  return {
    packageId,
    label: definition.label,
    installed: true,
    enabled: true,
    configuration,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function installPackage(packages = [], packageId, configuration = {}) {
  const existing = packages.find((entry) => entry.packageId === packageId);

  if (existing) {
    return packages.map((entry) =>
      entry.packageId === packageId
        ? {
            ...entry,
            installed: true,
            enabled: true,
            configuration: { ...entry.configuration, ...configuration },
            updatedAt: new Date().toISOString()
          }
        : entry
    );
  }

  return [...packages, createPackageRecord(packageId, configuration)];
}

function uninstallPackage(packages = [], packageId) {
  return packages.filter((entry) => entry.packageId !== packageId);
}

function setPackageEnabled(packages = [], packageId, enabled) {
  return packages.map((entry) =>
    entry.packageId === packageId ? { ...entry, enabled, updatedAt: new Date().toISOString() } : entry
  );
}

function configurePackage(packages = [], packageId, configuration = {}) {
  return packages.map((entry) =>
    entry.packageId === packageId
      ? {
          ...entry,
          configuration: { ...entry.configuration, ...configuration },
          updatedAt: new Date().toISOString()
        }
      : entry
  );
}

function getInstalledPackage(packages = [], packageId) {
  return packages.find((entry) => entry.packageId === packageId && entry.installed) || null;
}

function buildPackageConfiguration(orgRecord, packageId) {
  const pkg = getInstalledPackage(orgRecord.packages, packageId);

  if (!pkg?.enabled) {
    return null;
  }

  const primaryOffice = orgRecord.locations.find((office) => office.status === "active");

  return {
    packageId,
    organizationName: orgRecord.profile.name,
    branding: orgRecord.branding,
    officeLocations: orgRecord.locations,
    primaryOfficeAddress: primaryOffice?.address || null,
    policies: orgRecord.policies,
    settings: orgRecord.settings,
    ...pkg.configuration
  };
}

module.exports = {
  SUPPORTED_PACKAGES,
  installPackage,
  uninstallPackage,
  setPackageEnabled,
  configurePackage,
  getInstalledPackage,
  buildPackageConfiguration
};
