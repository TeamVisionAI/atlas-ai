/**
 * BR-161 — iCloud availability adapter.
 * Read-only busy windows. Auth/unavailable errors propagate to the
 * scheduling engine, which degrades the overlay instead of zeroing slots.
 */

const icloudCalendarIntegrationService = require("../../services/icloudCalendarIntegrationService");
const { PROVIDERS } = require("./availabilityTypes");
const { isIcloudAvailabilityEnabled } = require("./icloudAvailabilityFlag");

async function isConnected(organizationId, userId) {
  if (!isIcloudAvailabilityEnabled({ organizationId, userId })) {
    return false;
  }
  return icloudCalendarIntegrationService.isConnected(organizationId, userId);
}

async function listBusyWindows(params = {}) {
  return icloudCalendarIntegrationService.listBusyWindows(params);
}

module.exports = {
  providerId: PROVIDERS.ICLOUD_CALENDAR,
  isConnected,
  listBusyWindows
};
