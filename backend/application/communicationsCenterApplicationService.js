/**
 * Communications Center application service — prospect-id authorized aggregation.
 */

const {
  buildCommunicationsCenterTimeline
} = require("../core/communicationsCenterReadModel");
const {
  resolveChannelIdentitiesFromProspect,
  publicChannelIdentities,
  collectAuthorizedPhoneVariants,
  preferredLanguage,
  prospectDisplayName
} = require("../core/communicationsCenterIdentity");
const { normalizePhoneNumber, formatPhoneForStorage } = require("../core/phoneNormalizer");
const { isProductionProspect } = require("../core/productionProspectFilter");
const {
  sanitizeCommunicationsCenterResponse
} = require("../core/communicationsCenterSanitizer");

function countLegacyProspectsSharingPhone(args) {
  return require("../security/prospectAccessService").countLegacyProspectsSharingPhone(
    args
  );
}

async function evaluatePhoneSafety({ organizationId, identities }) {
  const current = identities.find((identity) => identity.isCurrent) || identities[0];

  if (!current?.normalizedAddress) {
    return {
      phoneFallbackAllowed: false,
      allowNullOrgPhoneFallback: false,
      reason: "No current channel identity available for phone fallback."
    };
  }

  const normalized = normalizePhoneNumber(current.normalizedAddress);
  const storage = formatPhoneForStorage(normalized);
  const withinOrg = await countLegacyProspectsSharingPhone({
    phone: storage,
    normalizedPhone: normalized,
    organizationId
  });
  const globalCount = await countLegacyProspectsSharingPhone({
    phone: storage,
    normalizedPhone: normalized,
    organizationId: null
  });

  if (withinOrg > 1) {
    return {
      phoneFallbackAllowed: false,
      allowNullOrgPhoneFallback: false,
      reason: "Phone is shared by multiple prospects in the organization; phone correlation disabled.",
      withinOrg,
      globalCount
    };
  }

  if (globalCount > 1) {
    return {
      phoneFallbackAllowed: true,
      allowNullOrgPhoneFallback: false,
      reason:
        "Phone appears in multiple organizations; null-organization phone records excluded.",
      withinOrg,
      globalCount
    };
  }

  return {
    phoneFallbackAllowed: true,
    allowNullOrgPhoneFallback: true,
    reason: null,
    withinOrg,
    globalCount
  };
}

/**
 * @param {object} params
 * @param {object} params.prospect - authorized prospect row
 * @param {"legacy"|"core"} params.prospectSource
 * @param {string} params.organizationId
 * @param {object} [params.query]
 * @param {object} [params.loaders]
 */
async function getProspectCommunications({
  prospect,
  prospectSource = "legacy",
  organizationId,
  query = {},
  loaders
}) {
  const prospectId = prospect?.id || prospect?.prospect_id;

  if (!prospectId) {
    const error = new Error("Prospect id missing on authorized prospect.");
    error.statusCode = 500;
    throw error;
  }

  if (!organizationId) {
    const error = new Error("Organization context is required.");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }

  const identities = resolveChannelIdentitiesFromProspect(prospect, prospectSource);
  const currentPhone =
    identities.find((identity) => identity.isCurrent)?.normalizedAddress ||
    prospect.phone ||
    prospect.primary_phone ||
    null;

  if (currentPhone && !isProductionProspect(currentPhone)) {
    const error = new Error("Communications Center prospect not found");
    error.statusCode = 404;
    throw error;
  }

  const phoneSafety = await evaluatePhoneSafety({ organizationId, identities });
  const authorizedPhones = collectAuthorizedPhoneVariants(identities);

  const timeline = await buildCommunicationsCenterTimeline({
    prospectId: String(prospectId),
    organizationId,
    prospectDisplayName: prospectDisplayName(prospect),
    preferredLanguage: preferredLanguage(prospect),
    channelIdentities: identities,
    publicChannelIdentities: publicChannelIdentities(identities),
    authorizedPhones,
    phoneFallbackAllowed: phoneSafety.phoneFallbackAllowed,
    allowNullOrgPhoneFallback: phoneSafety.allowNullOrgPhoneFallback,
    phoneSafety,
    timezone: query.timezone || "America/New_York",
    limit: query.limit,
    projection: query.projection || "full",
    before: query.before || null,
    loaders
  });

  // Defense-in-depth: never return raw contact addresses / secrets from this API.
  return sanitizeCommunicationsCenterResponse(timeline);
}

module.exports = {
  getProspectCommunications,
  evaluatePhoneSafety
};
