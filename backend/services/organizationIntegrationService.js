/**
 * Organization-level integrations facade (MVP — temporary home under Organization settings).
 */

const googleCalendarIntegrationService = require("./googleCalendarIntegrationService");
const whatsappIntegrationService = require("./whatsappIntegrationService");

async function getIntegrationsStatus(organizationId) {
  const [googleCalendar, whatsapp] = await Promise.all([
    googleCalendarIntegrationService.getIntegrationStatus(organizationId),
    whatsappIntegrationService.getIntegrationStatusForOrganization(organizationId)
  ]);

  return {
    googleCalendar,
    whatsapp
  };
}

module.exports = {
  getIntegrationsStatus,
  googleCalendarIntegrationService
};
