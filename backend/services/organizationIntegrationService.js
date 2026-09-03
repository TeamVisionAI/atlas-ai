/**
 * Integrations facade — personal workspace (BR-147) + agent capabilities (BR-148).
 */

const googleCalendarIntegrationService = require("./googleCalendarIntegrationService");
const icloudCalendarIntegrationService = require("./icloudCalendarIntegrationService");
const whatsappIntegrationService = require("./whatsappIntegrationService");
const appointmentProfileService = require("./appointmentProfileService");
const { hasPermission } = require("../security/authorizationService");
const { PERMISSIONS } = require("../security/permissions");
const {
  resolveAgentCapabilitiesFromUser,
  evaluateAgentWorkspaceReadiness
} = require("../core/agentCapabilitiesEngine");

async function getIntegrationsStatus(organizationId, authContext = null, options = {}) {
  const includeOrganizationChannel = options.includeOrganizationChannel !== false;
  const userId = authContext?.userId || null;
  let capabilityUser = authContext?.user || null;

  if (!capabilityUser && userId) {
    try {
      const { findUserById } = require("./atlasUserService");
      capabilityUser = await findUserById(userId);
    } catch {
      capabilityUser = null;
    }
  }

  const capabilities = resolveAgentCapabilitiesFromUser(capabilityUser);

  const [googleCalendar, icloudCalendar, whatsappRaw] = await Promise.all([
    googleCalendarIntegrationService.getPersonalIntegrationStatus(organizationId, userId),
    icloudCalendarIntegrationService.getIntegrationStatus(organizationId, userId),
    capabilities.personalWhatsAppEnabled
      ? whatsappIntegrationService.getPersonalIntegrationStatusForOrganization(
          organizationId,
          userId
        )
      : Promise.resolve({
          connected: false,
          status: "capability_disabled",
          connection: null,
          ownership: "personal",
          capabilityEnabled: false
        })
  ]);

  const whatsapp = {
    ...whatsappRaw,
    capabilityEnabled: capabilities.personalWhatsAppEnabled === true,
    visible: capabilities.personalWhatsAppEnabled === true
  };

  let personalZoomUrl = null;
  let availabilityConfigured = false;
  let profileComplete = Boolean(authContext?.user?.first_name && authContext?.user?.email);

  if (userId) {
    try {
      const profile = await appointmentProfileService.getAppointmentProfile(userId);
      personalZoomUrl =
        profile?.appointmentProfile?.virtualMeeting?.personalMeetingUrl || null;
      availabilityConfigured = appointmentProfileService.isAppointmentProfileConfigured(
        profile?.appointmentProfile
      );
      profileComplete = Boolean(profile?.firstName || profile?.email || profileComplete);
    } catch {
      personalZoomUrl = null;
    }
  }

  const readiness = evaluateAgentWorkspaceReadiness({
    capabilities,
    profileComplete,
    googleConnected: Boolean(googleCalendar?.connected),
    zoomConfigured: Boolean(personalZoomUrl),
    availabilityConfigured,
    personalWhatsAppConnected: Boolean(whatsapp?.connected)
  });

  const result = {
    googleCalendar,
    icloudCalendar,
    whatsapp,
    zoom: {
      connected: Boolean(personalZoomUrl),
      personalMeetingUrl: personalZoomUrl,
      ownership: "personal"
    },
    agentCapabilities: capabilities,
    readiness,
    organizationLeadChannel: capabilities.canReceiveOrganizationLeads
      ? {
          managedByOrganization: true,
          messageKey: "configurationLeadChannelOrganizationManaged"
        }
      : null
  };

  if (authContext && hasPermission(authContext, PERMISSIONS.ORG_WRITE) && includeOrganizationChannel) {
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
