/**
 * Resolves outbound agent notification destinations for urgent appointment handoff.
 * Fail closed — never infer WhatsApp numbers from atlas_users.phone or prospect phones.
 *
 * Expected configuration (not yet exposed in product UI):
 * - atlas_users.notification_preferences.urgentAppointmentWhatsAppE164
 * - atlas_users.notification_preferences.urgentAppointmentWhatsAppEnabled === true
 * - organization recruiting config scheduling.urgentEscalationUserId (backup/admin)
 */

const atlasUserService = require("../services/atlasUserService");
const { normalizePhoneNumber } = require("./phoneNormalizer");

function readExplicitWhatsAppDestination(user = {}) {
  const prefs = user.notification_preferences || user.notificationPreferences || {};

  if (prefs.urgentAppointmentWhatsAppEnabled !== true) {
    return null;
  }

  const raw =
    prefs.urgentAppointmentWhatsAppE164 ||
    prefs.urgentAppointmentWhatsApp ||
    null;

  if (!raw) {
    return null;
  }

  return normalizePhoneNumber(raw) || String(raw).trim() || null;
}

/**
 * @returns {Promise<{ userId: string, whatsappE164: string } | null>}
 */
async function resolveAgentUrgentWhatsAppDestination({ userId, organizationId }) {
  if (!userId || !organizationId) {
    return null;
  }

  const user = await atlasUserService.findUserById(userId);

  if (!user || user.organization_id !== organizationId) {
    return null;
  }

  const whatsappE164 = readExplicitWhatsAppDestination(user);

  if (!whatsappE164) {
    return null;
  }

  return {
    userId: user.id,
    whatsappE164
  };
}

/**
 * @returns {Promise<{ userId: string, whatsappE164: string } | null>}
 */
async function resolveUrgentEscalationWhatsAppDestination({ organizationId, organizationSettings = null }) {
  if (!organizationId) {
    return null;
  }

  let settings = organizationSettings;

  if (!settings) {
    try {
      const { loadOrganizationSettingsRow } = require("./autonomousScheduleAgentResolver");
      settings = await loadOrganizationSettingsRow(organizationId);
    } catch {
      settings = null;
    }
  }

  const escalationUserId =
    settings?.scheduling?.urgentEscalationUserId ||
    settings?.scheduling?.urgentEscalationAgentUserId ||
    null;

  if (!escalationUserId) {
    return null;
  }

  return resolveAgentUrgentWhatsAppDestination({
    userId: escalationUserId,
    organizationId
  });
}

module.exports = {
  readExplicitWhatsAppDestination,
  resolveAgentUrgentWhatsAppDestination,
  resolveUrgentEscalationWhatsAppDestination
};
