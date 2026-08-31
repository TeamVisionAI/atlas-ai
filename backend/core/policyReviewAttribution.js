/**
 * BR-188 — IUL / policy-review acquisition attribution.
 * First valid source locks first touch. Later sources update latest touch only.
 * Empty later events must not erase a confirmed source. Never routes to Recruit AI.
 */

const SOURCE_PLATFORMS = Object.freeze({
  META: "meta",
  TIKTOK: "tiktok",
  GOOGLE: "google",
  QR: "qr",
  CAMPAIGN_INTAKE: "campaign_intake",
  LANDING: "landing",
  WHATSAPP: "whatsapp",
  UNKNOWN: "unknown"
});

const ACQUISITION_GROUP_BY = Object.freeze([
  "platform",
  "campaign",
  "ad",
  "creative",
  "intakeCode",
  "owner",
  "language",
  "state"
]);

const PLATFORM_ALIASES = Object.freeze({
  meta: SOURCE_PLATFORMS.META,
  facebook: SOURCE_PLATFORMS.META,
  fb: SOURCE_PLATFORMS.META,
  instagram: SOURCE_PLATFORMS.META,
  ig: SOURCE_PLATFORMS.META,
  ctwa: SOURCE_PLATFORMS.META,
  whatsapp: SOURCE_PLATFORMS.WHATSAPP,
  tiktok: SOURCE_PLATFORMS.TIKTOK,
  google: SOURCE_PLATFORMS.GOOGLE,
  qr: SOURCE_PLATFORMS.QR,
  campaign_intake: SOURCE_PLATFORMS.CAMPAIGN_INTAKE,
  intake: SOURCE_PLATFORMS.CAMPAIGN_INTAKE,
  landing: SOURCE_PLATFORMS.LANDING,
  form: SOURCE_PLATFORMS.LANDING
});

const PLATFORM_LABELS = Object.freeze({
  [SOURCE_PLATFORMS.META]: "Meta",
  [SOURCE_PLATFORMS.TIKTOK]: "TikTok",
  [SOURCE_PLATFORMS.GOOGLE]: "Google",
  [SOURCE_PLATFORMS.QR]: "QR",
  [SOURCE_PLATFORMS.CAMPAIGN_INTAKE]: "Campaign intake",
  [SOURCE_PLATFORMS.LANDING]: "Landing / form",
  [SOURCE_PLATFORMS.WHATSAPP]: "WhatsApp",
  [SOURCE_PLATFORMS.UNKNOWN]: "Unknown"
});

function trim(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizePlatform(value) {
  const raw = trim(value);
  if (!raw) return null;
  return PLATFORM_ALIASES[raw.toLowerCase()] || raw.toLowerCase();
}

function normalizeCtwa(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ctwaClid = trim(raw.ctwaClid || raw.ctwa_clid);
  const sourceType = trim(raw.sourceType || raw.source_type);
  const sourceId = trim(raw.sourceId || raw.source_id);
  if (!ctwaClid && String(sourceType || "").toLowerCase() !== "ad" && !sourceId) {
    return null;
  }
  return {
    sourceType,
    sourceId,
    ctwaClid,
    sourceUrl: trim(raw.sourceUrl || raw.source_url),
    headline: trim(raw.headline),
    body: trim(raw.body)
  };
}

function emptyTouch() {
  return {
    at: null,
    platform: null,
    source: null,
    campaignId: null,
    campaignName: null,
    adSetId: null,
    adSetName: null,
    adId: null,
    adName: null,
    creativeId: null,
    creativeName: null,
    intakeCode: null,
    landingFormSource: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    ctwa: null
  };
}

function emptyAcquisition() {
  return {
    firstTouch: emptyTouch(),
    latestTouch: emptyTouch()
  };
}

function normalizeAcquisitionEvent(input = {}) {
  const nested = input.acquisition && typeof input.acquisition === "object" ? input.acquisition : {};
  const first = nested.firstTouch && typeof nested.firstTouch === "object" ? nested.firstTouch : {};
  const raw = { ...first, ...nested, ...input };
  const ctwa = normalizeCtwa(raw.ctwa || raw.ctwaReferral || input.ctwaReferral);
  const platform =
    normalizePlatform(raw.platform || raw.sourcePlatform) ||
    (ctwa ? SOURCE_PLATFORMS.META : null) ||
    (trim(raw.intakeCode || raw.campaignIntakeCode) ? SOURCE_PLATFORMS.CAMPAIGN_INTAKE : null) ||
    normalizePlatform(raw.source);
  const touch = {
    at: trim(raw.at || raw.firstTouchAt || raw.timestamp) || new Date().toISOString(),
    platform,
    source: trim(raw.source) || platform,
    campaignId: trim(raw.campaignId || raw.campaign_id),
    campaignName: trim(raw.campaignName || raw.campaign_name || raw.campaign),
    adSetId: trim(raw.adSetId || raw.adsetId || raw.adset_id),
    adSetName: trim(raw.adSetName || raw.adsetName || raw.adset_name),
    adId: trim(raw.adId || raw.ad_id || ctwa?.sourceId),
    adName: trim(raw.adName || raw.ad_name || ctwa?.headline),
    creativeId: trim(raw.creativeId || raw.creative_id),
    creativeName: trim(raw.creativeName || raw.creative_name),
    intakeCode: trim(raw.intakeCode || raw.campaignIntakeCode || raw.campaign_intake_code),
    landingFormSource: trim(raw.landingFormSource || raw.landing_form_source || raw.formSource),
    utmSource: trim(raw.utmSource || raw.utm_source),
    utmMedium: trim(raw.utmMedium || raw.utm_medium),
    utmCampaign: trim(raw.utmCampaign || raw.utm_campaign),
    utmContent: trim(raw.utmContent || raw.utm_content),
    utmTerm: trim(raw.utmTerm || raw.utm_term),
    ctwa
  };
  return touch;
}

function hasValidAcquisition(touch) {
  if (!touch || typeof touch !== "object") return false;
  return Boolean(
    touch.intakeCode ||
      touch.campaignId ||
      touch.campaignName ||
      touch.adId ||
      touch.adSetId ||
      touch.creativeId ||
      touch.utmSource ||
      touch.utmCampaign ||
      touch.landingFormSource ||
      touch.ctwa?.ctwaClid ||
      touch.ctwa?.sourceId ||
      (touch.platform && touch.platform !== SOURCE_PLATFORMS.UNKNOWN)
  );
}

function cloneTouch(touch) {
  if (!touch) return emptyTouch();
  return {
    ...emptyTouch(),
    ...touch,
    ctwa: touch.ctwa ? { ...touch.ctwa } : null
  };
}

function mergeAcquisition(existing, incoming, at = new Date().toISOString()) {
  const current =
    existing && typeof existing === "object"
      ? {
          firstTouch: cloneTouch(existing.firstTouch),
          latestTouch: cloneTouch(existing.latestTouch)
        }
      : emptyAcquisition();
  const event = incoming && incoming.platform !== undefined ? incoming : normalizeAcquisitionEvent(incoming || {});
  if (!hasValidAcquisition(event)) {
    return current;
  }
  const stamped = { ...cloneTouch(event), at: event.at || at };
  if (!hasValidAcquisition(current.firstTouch)) {
    return {
      firstTouch: stamped,
      latestTouch: cloneTouch(stamped)
    };
  }
  return {
    firstTouch: current.firstTouch,
    latestTouch: stamped
  };
}

function flattenFirstTouch(acquisition) {
  const first = acquisition?.firstTouch || emptyTouch();
  const latest = acquisition?.latestTouch || emptyTouch();
  return {
    sourcePlatform: first.platform || null,
    source: first.source || first.platform || null,
    campaignId: first.campaignId || null,
    campaign: first.campaignName || first.campaignId || null,
    campaignName: first.campaignName || null,
    adsetId: first.adSetId || null,
    adSetName: first.adSetName || null,
    adId: first.adId || null,
    adName: first.adName || null,
    creativeId: first.creativeId || null,
    creativeName: first.creativeName || null,
    campaignIntakeCode: first.intakeCode || null,
    landingFormSource: first.landingFormSource || null,
    utmSource: first.utmSource || null,
    utmMedium: first.utmMedium || null,
    utmCampaign: first.utmCampaign || null,
    utmContent: first.utmContent || null,
    utmTerm: first.utmTerm || null,
    firstTouchAt: first.at || null,
    latestTouchAt: latest.at || null
  };
}

function friendlyPlatformLabel(platform) {
  return PLATFORM_LABELS[platform] || (platform ? String(platform) : null);
}

function friendlySourceLabel(touch) {
  if (!hasValidAcquisition(touch)) return null;
  return (
    friendlyPlatformLabel(touch.platform) ||
    touch.source ||
    touch.intakeCode ||
    touch.campaignName ||
    null
  );
}

function presentTouch(touch) {
  const normalized = cloneTouch(touch);
  return {
    ...normalized,
    platformLabel: friendlyPlatformLabel(normalized.platform),
    sourceLabel: friendlySourceLabel(normalized),
    campaignLabel: normalized.campaignName || normalized.campaignId || null,
    adLabel: normalized.adName || normalized.adId || null,
    adSetLabel: normalized.adSetName || normalized.adSetId || null,
    creativeLabel: normalized.creativeName || normalized.creativeId || null
  };
}

function presentAcquisition(acquisition) {
  const snapshot = acquisition && typeof acquisition === "object" ? acquisition : emptyAcquisition();
  const first = presentTouch(snapshot.firstTouch);
  const latest = presentTouch(snapshot.latestTouch);
  return {
    firstTouch: first,
    latestTouch: latest,
    sourceLabel: first.sourceLabel,
    campaignLabel: first.campaignLabel,
    adLabel: first.adLabel,
    creativeLabel: first.creativeLabel
  };
}

function applyAcquisitionToRecord(row, input = {}, at = new Date().toISOString()) {
  const event = normalizeAcquisitionEvent(input.acquisitionEvent || input);
  const acquisition = mergeAcquisition(row.acquisition, event, at);
  const flat = flattenFirstTouch(acquisition);
  return {
    ...row,
    ...flat,
    acquisition
  };
}

const QUALIFIED_STAGES = new Set([
  "QUALIFIED",
  "APPOINTMENT_BOOKED",
  "DOCUMENTS_REQUESTED",
  "DOCUMENTS_RECEIVED",
  "REVIEW_COMPLETED",
  "KEEP_CURRENT",
  "ADJUST_CURRENT",
  "REPLACEMENT_OPPORTUNITY",
  "APPLICATION_SUBMITTED",
  "PLACED"
]);
const APPOINTMENT_STAGES = new Set([
  "APPOINTMENT_BOOKED",
  "DOCUMENTS_REQUESTED",
  "DOCUMENTS_RECEIVED",
  "REVIEW_COMPLETED",
  "KEEP_CURRENT",
  "ADJUST_CURRENT",
  "REPLACEMENT_OPPORTUNITY",
  "APPLICATION_SUBMITTED",
  "PLACED"
]);
const COMPLETED_STAGES = new Set([
  "REVIEW_COMPLETED",
  "KEEP_CURRENT",
  "ADJUST_CURRENT",
  "REPLACEMENT_OPPORTUNITY",
  "APPLICATION_SUBMITTED",
  "PLACED"
]);

function reached(item, stage, laterSet) {
  if (item?.stageTimestamps?.[stage]) return true;
  return laterSet.has(item?.stage);
}

function emptyAcquisitionMetrics() {
  return {
    reviewLeads: 0,
    qualifiedReviews: 0,
    appointmentsBooked: 0,
    reviewsCompleted: 0,
    replacementOpportunities: 0,
    applicationsSubmitted: 0,
    placedPolicies: 0,
    monthlyPremium: 0,
    annualizedPremium: 0,
    estimatedCommission: 0,
    adSpend: null,
    costPerLead: null,
    roas: null
  };
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function addItemMetrics(target, item) {
  target.reviewLeads += 1;
  if (reached(item, "QUALIFIED", QUALIFIED_STAGES)) target.qualifiedReviews += 1;
  if (item.appointmentId || reached(item, "APPOINTMENT_BOOKED", APPOINTMENT_STAGES)) {
    target.appointmentsBooked += 1;
  }
  if (reached(item, "REVIEW_COMPLETED", COMPLETED_STAGES)) target.reviewsCompleted += 1;
  if (item.stage === "REPLACEMENT_OPPORTUNITY" || item.stageTimestamps?.REPLACEMENT_OPPORTUNITY) {
    target.replacementOpportunities += 1;
  }
  if (
    item.stage === "APPLICATION_SUBMITTED" ||
    item.stage === "PLACED" ||
    item.stageTimestamps?.APPLICATION_SUBMITTED
  ) {
    target.applicationsSubmitted += 1;
  }
  if (item.stage === "PLACED" || item.stageTimestamps?.PLACED) target.placedPolicies += 1;
  target.monthlyPremium = money(target.monthlyPremium + (Number(item.monthlyPremium) || 0));
  target.annualizedPremium = money(target.annualizedPremium + (Number(item.annualizedPremium) || 0));
  const commission =
    item.commissionLabel === "ACTUAL"
      ? Number(item.commissionAmount) || 0
      : Number(item.estimatedTakeHome || item.commissionAmount) || 0;
  target.estimatedCommission = money(target.estimatedCommission + commission);
}

function groupKeyFor(item, groupBy) {
  const first = item.acquisition?.firstTouch || {};
  switch (groupBy) {
    case "platform":
      return first.platform || item.sourcePlatform || "unknown";
    case "campaign":
      return first.campaignId || first.campaignName || item.campaignId || item.campaign || "unknown";
    case "ad":
      return first.adId || first.adName || item.adId || "unknown";
    case "creative":
      return first.creativeId || first.creativeName || item.creativeId || "unknown";
    case "intakeCode":
      return first.intakeCode || item.campaignIntakeCode || "unknown";
    case "owner":
      return item.ownerUserId || "unknown";
    case "language":
      return item.language || "unknown";
    case "state":
      return item.state || "unknown";
    default:
      return "all";
  }
}

function groupLabelFor(item, groupBy, key) {
  const first = presentTouch(item.acquisition?.firstTouch);
  switch (groupBy) {
    case "platform":
      return first.platformLabel || key;
    case "campaign":
      return first.campaignLabel || key;
    case "ad":
      return first.adLabel || key;
    case "creative":
      return first.creativeLabel || key;
    case "owner":
      return item.ownerName || key;
    default:
      return key;
  }
}

function aggregateAcquisitionMetrics(items = [], { groupBy = "campaign" } = {}) {
  const totals = emptyAcquisitionMetrics();
  const groups = new Map();
  for (const item of items) {
    addItemMetrics(totals, item);
    const key = groupKeyFor(item, groupBy);
    if (!groups.has(key)) {
      groups.set(key, {
        groupBy,
        key,
        label: groupLabelFor(item, groupBy, key),
        ...emptyAcquisitionMetrics()
      });
    }
    const group = groups.get(key);
    addItemMetrics(group, item);
    if (!group.label || group.label === "unknown") {
      group.label = groupLabelFor(item, groupBy, key);
    }
  }
  return {
    groupBy: ACQUISITION_GROUP_BY.includes(groupBy) ? groupBy : "campaign",
    totals,
    groups: [...groups.values()].sort((left, right) =>
      String(left.label || left.key).localeCompare(String(right.label || right.key))
    )
  };
}

function acquisitionFromIntake({ match, ctwaReferral, utm, landingFormSource, at } = {}) {
  return normalizeAcquisitionEvent({
    at,
    platform: ctwaReferral ? SOURCE_PLATFORMS.META : SOURCE_PLATFORMS.CAMPAIGN_INTAKE,
    source: ctwaReferral ? "meta" : "campaign_intake",
    campaignId: match?.campaignIntakeCodeId || null,
    campaignName: match?.campaignName || null,
    intakeCode: match?.code || match?.campaignIntakeCode || null,
    landingFormSource: landingFormSource || null,
    utmSource: utm?.source,
    utmMedium: utm?.medium,
    utmCampaign: utm?.campaign,
    utmContent: utm?.content,
    utmTerm: utm?.term,
    adId: ctwaReferral?.sourceId,
    adName: ctwaReferral?.headline,
    ctwaReferral
  });
}

module.exports = {
  SOURCE_PLATFORMS,
  ACQUISITION_GROUP_BY,
  PLATFORM_LABELS,
  emptyTouch,
  emptyAcquisition,
  emptyAcquisitionMetrics,
  normalizeAcquisitionEvent,
  hasValidAcquisition,
  mergeAcquisition,
  flattenFirstTouch,
  presentAcquisition,
  presentTouch,
  friendlySourceLabel,
  friendlyPlatformLabel,
  applyAcquisitionToRecord,
  aggregateAcquisitionMetrics,
  acquisitionFromIntake
};
