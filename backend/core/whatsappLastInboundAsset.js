/**
 * Resolves the most recent inbound WhatsApp receiving phone_number_id
 * for a tenant-scoped conversation. Used so human composer sends reply
 * from the same asset that received the inbound (BR-165).
 *
 * Fail-soft: missing table / lookup errors return null so existing org/env
 * credential fallback remains.
 */

const { logWhatsAppStage } = require("./whatsappStructuredLogger");

function trimId(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function rowMatchesConversation(row, { organizationId, prospectId, prospectPhone }) {
  if (!row || !sameId(row.organization_id, organizationId)) {
    return false;
  }
  if (!trimId(row.phone_number_id)) {
    return false;
  }
  if (prospectId && row.prospect_id && sameId(row.prospect_id, prospectId)) {
    return true;
  }
  if (prospectPhone && row.prospect_phone && String(row.prospect_phone) === String(prospectPhone)) {
    return true;
  }
  return false;
}

/**
 * @param {{
 *   organizationId: string,
 *   prospectId?: string|null,
 *   prospectPhone?: string|null,
 *   findLatestInboundSnapshots?: Function
 * }} input
 * @returns {Promise<string|null>}
 */
async function resolveLastInboundWhatsAppPhoneNumberId(input = {}) {
  const organizationId = trimId(input.organizationId);
  const prospectId = trimId(input.prospectId);
  const prospectPhone = trimId(input.prospectPhone);

  if (!organizationId || (!prospectId && !prospectPhone)) {
    return null;
  }

  const findLatest =
    input.findLatestInboundSnapshots ||
    (async (filters) => {
      const {
        findInboundWebhookObservability
      } = require("../services/whatsappInboundWebhookObservabilityService");
      return findInboundWebhookObservability(filters);
    });

  try {
    const filters = { organizationId, limit: 20 };
    if (prospectId) {
      filters.prospectId = prospectId;
    } else {
      filters.phone = prospectPhone;
    }

    let rows = await findLatest(filters);
    if ((!Array.isArray(rows) || rows.length === 0) && prospectId && prospectPhone) {
      rows = await findLatest({
        organizationId,
        phone: prospectPhone,
        limit: 20
      });
    }

    const match = (Array.isArray(rows) ? rows : []).find((row) =>
      rowMatchesConversation(row, { organizationId, prospectId, prospectPhone })
    );
    return trimId(match?.phone_number_id);
  } catch (error) {
    logWhatsAppStage("human_composer_inbound_asset_lookup_failed", {
      level: "warn",
      organizationId,
      prospectId: prospectId || null,
      error: String(error?.message || error).slice(0, 160)
    });
    return null;
  }
}

module.exports = {
  resolveLastInboundWhatsAppPhoneNumberId,
  rowMatchesConversation
};
