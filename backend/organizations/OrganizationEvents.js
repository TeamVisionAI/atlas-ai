/**
 * Release 1.2 — Organization Console event constants.
 */

const OrganizationEvent = Object.freeze({
  CREATED: "organization.created",
  UPDATED: "organization.updated",
  DELETED: "organization.deleted",
  PACKAGE_INSTALLED: "organization.package.installed",
  PACKAGE_REMOVED: "organization.package.removed",
  OFFICE_CREATED: "organization.office.created",
  USER_CREATED: "organization.user.created",
  CONFIGURATION_CHANGED: "organization.configuration.changed",
  VALIDATION_FAILED: "organization.validation.failed"
});

module.exports = {
  OrganizationEvent
};
