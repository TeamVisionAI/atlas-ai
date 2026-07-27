/**
 * Organization-level integrations facade (MVP — temporary home under Organization settings).
 */

const googleCalendarIntegrationService = require("./googleCalendarIntegrationService");

async function getIntegrationsStatus(organizationId) {
  const googleCalendar = await googleCalendarIntegrationService.getIntegrationStatus(
    organizationId
  );

  return {
    googleCalendar
  };
}

module.exports = {
  getIntegrationsStatus,
  googleCalendarIntegrationService
};
