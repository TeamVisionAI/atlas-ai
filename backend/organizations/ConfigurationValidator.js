/**
 * Release 1.2 — Organization configuration validation.
 */

const { SUPPORTED_PACKAGES } = require("./OrganizationPackages");
const { CONNECTOR_IDS } = require("./OrganizationConnectors");
const { findUserByEmail } = require("./OrganizationUsers");

const COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function validateConfiguration(orgRecord) {
  const errors = [];
  const warnings = [];

  if (!orgRecord?.profile?.name) {
    errors.push({ field: "profile.name", message: "Organization name is required." });
  }

  if (!orgRecord?.profile?.primaryLanguage) {
    warnings.push({ field: "profile.primaryLanguage", message: "Primary language not set." });
  }

  validateBranding(orgRecord.branding, errors);
  validateOffices(orgRecord.locations, errors);
  validateUsers(orgRecord.users, errors, orgRecord.locations);
  validatePackages(orgRecord, errors);
  validateConnectors(orgRecord.connectors, orgRecord.locations, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateBranding(branding = {}, errors) {
  for (const field of ["primaryColor", "secondaryColor", "accentColor", "backgroundColor"]) {
    const value = branding[field];

    if (value && !COLOR_PATTERN.test(value)) {
      errors.push({ field: `branding.${field}`, message: `Invalid color value: ${value}` });
    }
  }
}

function validateOffices(locations = [], errors) {
  const names = new Set();

  for (const office of locations) {
    if (names.has(office.name)) {
      errors.push({ field: "locations", message: `Duplicate office name: ${office.name}` });
    }

    names.add(office.name);
  }
}

function validateUsers(users = [], errors, locations = []) {
  const emails = new Set();
  const officeIds = new Set(locations.map((office) => office.id));

  for (const user of users) {
    if (emails.has(user.email)) {
      errors.push({ field: "users", message: `Duplicate user email: ${user.email}` });
    }

    emails.add(user.email);

    if (user.officeId && !officeIds.has(user.officeId)) {
      errors.push({
        field: `users.${user.id}.officeId`,
        message: `User office assignment not found: ${user.officeId}`
      });
    }
  }
}

function validatePackages(orgRecord, errors) {
  for (const pkg of orgRecord.packages || []) {
    const definition = SUPPORTED_PACKAGES[pkg.packageId];

    if (!definition) {
      errors.push({ field: "packages", message: `Unsupported package: ${pkg.packageId}` });
      continue;
    }

    if (definition.dependencies.includes("office") && orgRecord.locations.length === 0) {
      errors.push({
        field: "packages",
        message: `Package ${pkg.packageId} requires at least one office.`
      });
    }
  }
}

function validateConnectors(connectors = {}, locations = [], errors) {
  const officeIds = new Set(locations.map((office) => office.id));

  for (const connectorId of CONNECTOR_IDS) {
    const connector = connectors[connectorId];

    if (!connector) {
      continue;
    }

    if (connector.enabled && connector.defaultOfficeId && !officeIds.has(connector.defaultOfficeId)) {
      errors.push({
        field: `connectors.${connectorId}.defaultOfficeId`,
        message: "Connector default office not found."
      });
    }
  }
}

module.exports = {
  validateConfiguration
};
