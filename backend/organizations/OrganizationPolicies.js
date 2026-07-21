/**
 * Release 1.2 — Configurable organization business policies.
 */

function createDefaultPolicies(input = {}) {
  return {
    interviewDurationMinutes: input.interviewDurationMinutes ?? 30,
    reminderSchedule: input.reminderSchedule || {
      offsetsMinutes: [1440, 120, 30, 5]
    },
    businessHours: input.businessHours || {
      start: input.businessHoursStart || null,
      end: input.businessHoursEnd || null,
      timeZone: input.businessHoursTimeZone || null
    },
    licensingRequirements: input.licensingRequirements || {
      examRequired: input.examRequired ?? null,
      requiredStates: input.requiredStates || []
    },
    escalationRules: input.escalationRules || [],
    maximumFollowUps: input.maximumFollowUps ?? null,
    allowedChannels: input.allowedChannels || [],
    holidaySchedule: input.holidaySchedule || []
  };
}

function updatePolicies(current, patch = {}) {
  return {
    ...current,
    ...patch,
    reminderSchedule: {
      ...(current?.reminderSchedule || {}),
      ...(patch.reminderSchedule || {})
    },
    businessHours: {
      ...(current?.businessHours || {}),
      ...(patch.businessHours || {})
    },
    licensingRequirements: {
      ...(current?.licensingRequirements || {}),
      ...(patch.licensingRequirements || {})
    }
  };
}

function policiesForPackage(policies) {
  return { ...policies };
}

module.exports = {
  createDefaultPolicies,
  updatePolicies,
  policiesForPackage
};
