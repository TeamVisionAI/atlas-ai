/**
 * Release 1.1 — Configurable Team Vision Recruiting Pack settings.
 * No hardcoded business values — defaults are overridable at install time.
 */

const WORKFLOW_NAME = "team-vision-recruiting";

function createDefaultConfiguration(overrides = {}) {
  const base = {
    packageId: "teamvision-recruiting",
    workflowName: WORKFLOW_NAME,
    organizationName: overrides.organizationName || "Organization",
    brandColors: {
      primary: overrides.brandColors?.primary || "#1a365d",
      accent: overrides.brandColors?.accent || "#2b6cb0"
    },
    officeLocations: overrides.officeLocations || [
      {
        id: "primary-office",
        name: "Primary Office",
        address: overrides.primaryOfficeAddress || "",
        coverageRadiusMiles: overrides.coverageRadiusMiles ?? 25
      }
    ],
    interviewTypes: overrides.interviewTypes || ["office", "zoom"],
    workingHours: overrides.workingHours || {
      start: "09:00",
      end: "20:30",
      timeZone: "America/New_York"
    },
    languages: overrides.languages || ["en", "es"],
    calendarRules: overrides.calendarRules || {
      scheduleWithinHours: 48,
      defaultDurationMinutes: 30
    },
    zoomRules: overrides.zoomRules || {
      enabled: true,
      waitingRoom: true,
      joinBeforeHost: true
    },
    recruitingPolicies: overrides.recruitingPolicies || {
      requireWorkAuthorization: true,
      defaultVirtualForOutsideCoverage: true,
      escalateOutsideCoverageInPerson: true
    },
    licensingRequirements: overrides.licensingRequirements || {
      requiredStates: [],
      examRequired: true
    },
    reminderSchedule: overrides.reminderSchedule || {
      offsetsMinutes: [1440, 120, 30, 5]
    },
    escalationContacts: overrides.escalationContacts || []
  };

  return deepMerge(base, overrides);
}

function deepMerge(target, source) {
  const output = { ...target };

  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge(output[key] || {}, value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

function resolveWorkflowName(configuration) {
  return configuration?.workflowName || WORKFLOW_NAME;
}

module.exports = {
  WORKFLOW_NAME,
  createDefaultConfiguration,
  resolveWorkflowName
};
