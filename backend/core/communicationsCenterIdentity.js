/**
 * Communications Center — prospect contact identity resolution (read-only).
 * No durable historical channel table exists yet; see follow-up atlas_prospect_channel_identities.
 */

const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("./phoneNormalizer");
const { maskPhoneLast4 } = require("./communicationsCenterMasks");

function phoneLookupVariants(rawPhone) {
  const normalized = normalizePhoneNumber(rawPhone);
  const storage = formatPhoneForStorage(normalized);
  const variants = new Set();

  for (const value of [rawPhone, normalized, storage, normalized ? `+${normalized}` : null]) {
    if (value) {
      variants.add(String(value));
    }
  }

  return [...variants];
}

function buildChannelIdentity({
  channelIdentityId,
  channel,
  rawAddress,
  validFrom = null,
  validTo = null,
  isCurrent = false,
  source,
  verifiedAt = null,
  conversationId = null
}) {
  const normalized = normalizePhoneNumber(rawAddress);
  const normalizedAddress = formatPhoneForStorage(normalized) || null;

  return {
    prospectId: null, // filled by caller
    conversationId,
    channelIdentityId,
    channel,
    normalizedAddress,
    maskedAddress: maskPhoneLast4(normalizedAddress || rawAddress),
    validFrom,
    validTo,
    isCurrent: Boolean(isCurrent),
    source,
    verifiedAt
  };
}

/**
 * Resolve approved channel identities from an authorized prospect row.
 * Historical prior phones are NOT available in current schema.
 */
function resolveChannelIdentitiesFromProspect(prospect, source = "legacy") {
  const identities = [];
  const prospectId = prospect?.id || prospect?.prospect_id || null;
  const createdAt = prospect?.created_at || prospect?.createdAt || null;

  if (source === "legacy") {
    const phone = prospect?.phone || prospect?.primary_phone || null;
    if (phone) {
      const identity = buildChannelIdentity({
        channelIdentityId: `legacy-current-phone:${prospectId}`,
        channel: "whatsapp",
        rawAddress: phone,
        validFrom: createdAt,
        validTo: null,
        isCurrent: true,
        source: "prospects.phone",
        verifiedAt: null
      });
      identity.prospectId = prospectId;
      identities.push(identity);
    }
  } else {
    const primary = prospect?.primary_phone || prospect?.primaryPhone || null;
    const secondary = prospect?.secondary_phone || prospect?.secondaryPhone || null;

    if (primary) {
      const identity = buildChannelIdentity({
        channelIdentityId: `core-primary-phone:${prospectId}`,
        channel: "whatsapp",
        rawAddress: primary,
        validFrom: createdAt,
        validTo: null,
        isCurrent: true,
        source: "atlas_core_prospects.primary_phone",
        verifiedAt: null
      });
      identity.prospectId = prospectId;
      identities.push(identity);
    }

    if (secondary) {
      const identity = buildChannelIdentity({
        channelIdentityId: `core-secondary-phone:${prospectId}`,
        channel: "whatsapp",
        rawAddress: secondary,
        validFrom: createdAt,
        validTo: null,
        isCurrent: false,
        source: "atlas_core_prospects.secondary_phone",
        verifiedAt: null
      });
      identity.prospectId = prospectId;
      identities.push(identity);
    }

    const channels = prospect?.communication_channels || prospect?.communicationChannels;
    if (Array.isArray(channels)) {
      channels.forEach((entry, index) => {
        const address = entry?.address || entry?.phone || entry?.value || null;
        if (!address) {
          return;
        }
        const identity = buildChannelIdentity({
          channelIdentityId: `core-channel:${prospectId}:${index}`,
          channel: entry?.channel || entry?.type || "unknown",
          rawAddress: address,
          validFrom: entry?.validFrom || createdAt,
          validTo: entry?.validTo || null,
          isCurrent: entry?.isCurrent === true,
          source: "atlas_core_prospects.communication_channels",
          verifiedAt: entry?.verifiedAt || null,
          conversationId: entry?.conversationId || null
        });
        identity.prospectId = prospectId;
        identities.push(identity);
      });
    }
  }

  return identities;
}

function publicChannelIdentities(identities = []) {
  return identities.map((identity) => ({
    channelIdentityId: identity.channelIdentityId,
    channel: identity.channel,
    maskedAddress: identity.maskedAddress,
    validFrom: identity.validFrom,
    validTo: identity.validTo,
    isCurrent: identity.isCurrent,
    source: identity.source,
    verifiedAt: identity.verifiedAt,
    conversationId: identity.conversationId || null
    // normalizedAddress intentionally omitted from API responses
  }));
}

function collectAuthorizedPhoneVariants(identities = []) {
  const variants = new Set();

  for (const identity of identities) {
    for (const value of phoneLookupVariants(identity.normalizedAddress)) {
      variants.add(value);
    }
  }

  return [...variants];
}

function preferredLanguage(prospect) {
  return (
    prospect?.preferred_language ||
    prospect?.preferredLanguage ||
    prospect?.communication_language ||
    null
  );
}

function prospectDisplayName(prospect) {
  return (
    prospect?.display_name ||
    prospect?.displayName ||
    prospect?.name ||
    [prospect?.first_name, prospect?.last_name].filter(Boolean).join(" ") ||
    null
  );
}

module.exports = {
  phoneLookupVariants,
  buildChannelIdentity,
  resolveChannelIdentitiesFromProspect,
  publicChannelIdentities,
  collectAuthorizedPhoneVariants,
  preferredLanguage,
  prospectDisplayName
};
