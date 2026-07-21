/**
 * Journey #1 — Onboarding status and dashboard summary.
 */

const {
  getOrganizationForUser,
  serializeOrganization,
  resolveOnboardingRoute
} = require("./organizationService");
const { getEmbeddedSignupStatus } = require("../core/metaEmbeddedSignupService");
const googleCalendarOAuthService = require("./googleCalendarOAuthService");
const { getDashboardData } = require("../appointments/AppointmentService");
const { getMeetingDashboardData } = require("../meetings/MeetingDashboardService");
const jsonOrganizationRepository = require("../repositories/jsonOrganizationRepository");

function mergeActivityEntries(...groups) {
  return groups
    .flat()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);
}

async function getOnboardingStatus(user) {
  const organization = await getOrganizationForUser(user.id);
  let metaStatus = { connected: false };

  try {
    metaStatus = await getEmbeddedSignupStatus();
  } catch {
    metaStatus = { connected: organization?.settings?.meta_connected || false };
  }

  if (organization && metaStatus.connected && !organization.settings.meta_connected) {
    const { markMetaConnected } = require("./organizationService");
    await markMetaConnected(organization.id);
  }

  const refreshedOrganization = await getOrganizationForUser(user.id);

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name
    },
    organization: serializeOrganization(refreshedOrganization),
    nextRoute: resolveOnboardingRoute(refreshedOrganization),
    integrations: {
      meta: {
        configured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
        connected: Boolean(metaStatus.connected || refreshedOrganization?.settings?.meta_connected)
      },
      calendar: {
        configured: googleCalendarOAuthService.isConfigured(),
        connected: Boolean(refreshedOrganization?.settings?.calendar_connected)
      }
    }
  };
}

async function getHomeDashboardSummary(user) {
  const organization = await getOrganizationForUser(user.id);
  const organizationId = organization?.id || null;
  const appointmentDashboard = await getDashboardData(organizationId);
  const meetingDashboard = await getMeetingDashboardData(organizationId);

  let newProspects = [];

  try {
    const { createProspectService } = require("../prospects");
    const prospectService = createProspectService({});
    const prospects = await prospectService.listProspects();

    newProspects = prospects.slice(0, 5).map((prospect) => ({
      atlasId: prospect.atlasId,
      displayName: prospect.displayName || prospect.atlasId
    }));
  } catch {
    newProspects = [];
  }

  const hasMeetings = meetingDashboard.todaysMeetings.length > 0 ||
    meetingDashboard.nextMeeting ||
    meetingDashboard.upcomingMeetings.length > 0;

  const dashboard = {
    todaysMeetings: hasMeetings
      ? meetingDashboard.todaysMeetings
      : appointmentDashboard.todaysMeetings,
    nextMeeting: meetingDashboard.nextMeeting || appointmentDashboard.nextMeeting,
    upcomingMeetings: meetingDashboard.upcomingMeetings,
    needsAttention: meetingDashboard.needsAttention,
    atlasActivity: mergeActivityEntries(
      appointmentDashboard.atlasActivity,
      meetingDashboard.meetingActivity
    ),
    newProspects
  };

  if (!organization && !organizationId) {
    const fallbackOrg = await jsonOrganizationRepository.findFirstActivatedOrganization();

    if (fallbackOrg) {
      const fallbackAppointments = await getDashboardData(fallbackOrg.id);
      const fallbackMeetings = await getMeetingDashboardData(fallbackOrg.id);
      const fallbackHasMeetings =
        fallbackMeetings.todaysMeetings.length > 0 ||
        fallbackMeetings.nextMeeting ||
        fallbackMeetings.upcomingMeetings.length > 0;

      return {
        generatedAt: new Date().toISOString(),
        organization: serializeOrganization(fallbackOrg),
        todaysMeetings: fallbackHasMeetings
          ? fallbackMeetings.todaysMeetings
          : fallbackAppointments.todaysMeetings,
        nextMeeting: fallbackMeetings.nextMeeting || fallbackAppointments.nextMeeting,
        upcomingMeetings: fallbackMeetings.upcomingMeetings,
        needsAttention: fallbackMeetings.needsAttention,
        atlasActivity: mergeActivityEntries(
          fallbackAppointments.atlasActivity,
          fallbackMeetings.meetingActivity
        ),
        newProspects
      };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    organization: serializeOrganization(organization),
    ...dashboard
  };
}

module.exports = {
  getOnboardingStatus,
  getHomeDashboardSummary
};
