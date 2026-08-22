/**
 * Integrations facade — personal workspace (BR-147) + optional org channel for ORG_WRITE.
 */

const googleCalendarIntegrationService = require("./googleCalendarIntegrationService");
const whatsappIntegrationService = require("./whatsappIntegrationService");
const appointmentProfileService = require("./appointmentProfileService");
const { hasPermission } = require("../security/authorizationService");
const { PERMISSIONS } = require("../security/permissions");

async function getIntegrationsStatus(organizationId, authContext = null) {
  const userId = authContext?.userId || null;

  const [googleCalendar, whatsapp] = await Promise.all([
    googleCalendarIntegrationService.getPersonalIntegrationStatus(organizationId, userId),
    whatsappIntegrationService.getPersonalIntegrationStatusForOrganization(organizationId, userId)
  ]);

  let personalZoomUrl = null;
  if (userId) {
    try {
      const profile = await appointmentProfileService.getAppointmentProfile(userId);
      personalZoomUrl =
        profile?.appointmentProfile?.virtualMeeting?.personalMeetingUrl || null;
    } catch {
      personalZoomUrl = null;
    }
  }

  const result = {
    googleCalendar,
    whatsapp,
    zoom: {
      connected: Boolean(personalZoomUrl),
      personalMeetingUrl: personalZoomUrl,
      ownership: "personal"
    }
  };

  if (authContext && hasPermission(authContext, PERMISSIONS.ORG_WRITE)) {
    const [orgGoogle, orgWhatsApp] = await Promise.all([
      googleCalendarIntegrationService.getIntegrationStatus(organizationId),
      whatsappIntegrationService.getIntegrationStatusForOrganization(organizationId)
    ]);
    result.organizationChannel = {
      googleCalendar: orgGoogle,
      whatsapp: orgWhatsApp
    };
  }

  return result;
}

module.exports = {
  getIntegrationsStatus,
  googleCalendarIntegrationService
};
