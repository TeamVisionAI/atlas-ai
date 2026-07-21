/**
 * Release 1.2 — Organization-wide settings.
 */

function createDefaultSettings(input = {}) {
  return {
    languages: input.languages || [],
    timeZone: input.timeZone || null,
    localization: input.localization || {
      numberFormat: input.numberFormat || null,
      dateFormat: input.dateFormat || null
    },
    notificationPreferences: input.notificationPreferences || {},
    packageDefaults: input.packageDefaults || {},
    workflowDefaults: input.workflowDefaults || {
      defaultWorkflowName: input.defaultWorkflowName || null
    }
  };
}

function updateSettings(current, patch = {}) {
  return {
    ...current,
    ...patch,
    localization: {
      ...(current?.localization || {}),
      ...(patch.localization || {})
    },
    notificationPreferences: {
      ...(current?.notificationPreferences || {}),
      ...(patch.notificationPreferences || {})
    },
    packageDefaults: {
      ...(current?.packageDefaults || {}),
      ...(patch.packageDefaults || {})
    },
    workflowDefaults: {
      ...(current?.workflowDefaults || {}),
      ...(patch.workflowDefaults || {})
    }
  };
}

module.exports = {
  createDefaultSettings,
  updateSettings
};
