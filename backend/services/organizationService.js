/**
 * Journey #1 — Organization domain service.
 */

const jsonOrganizationRepository = require("../repositories/jsonOrganizationRepository");

const STEP_ROUTES = Object.freeze({
  meta: "/onboarding/meta",
  calendar: "/onboarding/calendar",
  meeting_preferences: "/onboarding/meeting-preferences",
  activate: "/onboarding/activate",
  complete: "/app"
});

async function getOrganizationForUser(userId) {
  const membership = await jsonOrganizationRepository.findMembershipForUser(userId);
  return membership?.organization || null;
}

async function createOrganizationForUser(userId, name) {
  const existing = await getOrganizationForUser(userId);

  if (existing) {
    return existing;
  }

  return jsonOrganizationRepository.createOrganization({
    name,
    ownerUserId: userId
  });
}

async function updateOrganizationSettings(organizationId, settingsPatch) {
  const organization = await jsonOrganizationRepository.findById(organizationId);

  if (!organization) {
    throw new Error("Organization not found");
  }

  return jsonOrganizationRepository.updateOrganization(organizationId, {
    settings: {
      ...organization.settings,
      ...settingsPatch
    }
  });
}

async function setOnboardingStep(organizationId, step) {
  return jsonOrganizationRepository.updateOrganization(organizationId, {
    onboarding_step: step
  });
}

async function markMetaConnected(organizationId) {
  const organization = await jsonOrganizationRepository.findById(organizationId);

  if (!organization) {
    throw new Error("Organization not found");
  }

  return jsonOrganizationRepository.updateOrganization(organizationId, {
    onboarding_step: organization.onboarding_step === "meta" ? "calendar" : organization.onboarding_step,
    settings: {
      ...organization.settings,
      meta_connected: true,
      meta_connected_at: new Date().toISOString()
    }
  });
}

async function markCalendarConnected(organizationId, refreshTokenEncrypted) {
  const organization = await jsonOrganizationRepository.findById(organizationId);

  if (!organization) {
    throw new Error("Organization not found");
  }

  return jsonOrganizationRepository.updateOrganization(organizationId, {
    onboarding_step:
      organization.onboarding_step === "calendar" ? "meeting_preferences" : organization.onboarding_step,
    settings: {
      ...organization.settings,
      calendar_connected: true,
      calendar_connected_at: new Date().toISOString(),
      calendar_refresh_token_encrypted: refreshTokenEncrypted
    }
  });
}

async function saveMeetingPreferences(organizationId, preferences) {
  const organization = await jsonOrganizationRepository.findById(organizationId);

  if (!organization) {
    throw new Error("Organization not found");
  }

  const meetingLocations = {
    office: Boolean(preferences.office),
    zoom: Boolean(preferences.zoom),
    starbucks: Boolean(preferences.starbucks),
    custom: Boolean(preferences.custom)
  };

  return jsonOrganizationRepository.updateOrganization(organizationId, {
    onboarding_step: "activate",
    settings: {
      ...organization.settings,
      meeting_locations: meetingLocations,
      office_address: preferences.officeAddress || null,
      starbucks_preference: preferences.starbucksPreference || null,
      custom_location_name: preferences.customLocationName || null,
      custom_location_address: preferences.customLocationAddress || null,
      zoom_interview_url: preferences.zoomInterviewUrl || organization.settings.zoom_interview_url || null
    }
  });
}

async function activateOrganization(organizationId) {
  const organization = await jsonOrganizationRepository.findById(organizationId);

  if (!organization) {
    throw new Error("Organization not found");
  }

  return jsonOrganizationRepository.updateOrganization(organizationId, {
    activated_at: new Date().toISOString(),
    onboarding_step: "complete",
    settings: organization.settings
  });
}

function resolveOnboardingRoute(organization) {
  if (!organization) {
    return "/onboarding/organization";
  }

  if (organization.activated_at || organization.onboarding_step === "complete") {
    return STEP_ROUTES.complete;
  }

  return STEP_ROUTES[organization.onboarding_step] || STEP_ROUTES.meta;
}

function serializeOrganization(organization) {
  if (!organization) {
    return null;
  }

  return {
    id: organization.id,
    name: organization.name,
    activatedAt: organization.activated_at,
    onboardingStep: organization.onboarding_step,
    settings: {
      meetingLocations: organization.settings.meeting_locations,
      officeAddress: organization.settings.office_address,
      starbucksPreference: organization.settings.starbucks_preference,
      customLocationName: organization.settings.custom_location_name,
      customLocationAddress: organization.settings.custom_location_address,
      zoomInterviewUrl: organization.settings.zoom_interview_url,
      metaConnected: organization.settings.meta_connected,
      calendarConnected: organization.settings.calendar_connected
    }
  };
}

module.exports = {
  getOrganizationForUser,
  createOrganizationForUser,
  updateOrganizationSettings,
  setOnboardingStep,
  markMetaConnected,
  markCalendarConnected,
  saveMeetingPreferences,
  activateOrganization,
  resolveOnboardingRoute,
  serializeOrganization
};
