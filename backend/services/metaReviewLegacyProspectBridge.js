/**
 * Meta App Review — temporary legacy-prospect bridge (LC2 removal target).
 *
 * Production recruiting runtime (Dashboard, Mission Control, Quick Capture, WhatsApp)
 * reads the legacy `prospects` table. Meta Review demo data is seeded into
 * `atlas_core_prospects` only. When a Meta Review user is created or activated,
 * mirror the four seeded demo prospects into legacy `prospects` with ownership
 * assigned to that user.
 *
 * Scope: Meta Review only — not a general synchronization layer.
 * Remove during LC2 consolidation when all recruiting surfaces read
 * `atlas_core_prospects` as the single canonical store.
 */

const { supabase, findProspectInOrganization } = require("./supabaseService");
const { isMetaReviewModeEnabled } = require("../config/metaReviewMode");
const { META_REVIEW_PROSPECTS } = require("../dev/environment/seedMetaReviewDemo");
const { LIFECYCLE_STATES, TABLE_NAME: CORE_PROSPECTS_TABLE } = require("../modules/prospects/domain/constants");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("../core/phoneNormalizer");
const { findProspectByNormalizedPhone } = require("../core/quickCaptureEngine");
const { generateNextProspectNumber } = require("./prospectNumberService");

const META_REVIEW_ENTRY_METHOD = "META_REVIEW_DEMO";
const META_REVIEW_SOURCE = "META_REVIEW";

const LEGACY_STEP_BY_LIFECYCLE = Object.freeze({
  [LIFECYCLE_STATES.NEW_LEAD]: "NEW",
  [LIFECYCLE_STATES.CONTACT_ATTEMPTED]: "GREETING",
  [LIFECYCLE_STATES.CONVERSATION_STARTED]: "GREETING",
  [LIFECYCLE_STATES.QUALIFIED]: "QUALIFICATION",
  [LIFECYCLE_STATES.INTERVIEW_SCHEDULED]: "CONFIRMED",
  [LIFECYCLE_STATES.INTERVIEW_COMPLETED]: "CONFIRMED",
  [LIFECYCLE_STATES.FOLLOW_UP]: "GREETING",
  [LIFECYCLE_STATES.CLIENT]: "CONFIRMED",
  [LIFECYCLE_STATES.RECRUIT]: "CONFIRMED",
  [LIFECYCLE_STATES.LOST]: "CLOSED"
});

function resolveLegacyCurrentStep(spec) {
  const lastLifecycle = spec.events?.[spec.events.length - 1]?.lifecycleStateAtEvent;

  return LEGACY_STEP_BY_LIFECYCLE[lastLifecycle] || "NEW";
}

function splitDisplayName(displayName) {
  const parts = String(displayName || "").trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || "Demo",
    lastName: parts.slice(1).join(" ") || null
  };
}

async function loadCoreDemoProspects() {
  const phones = META_REVIEW_PROSPECTS.map((spec) => spec.primaryPhone);

  const { data, error } = await supabase
    .from(CORE_PROSPECTS_TABLE)
    .select("primary_phone, normalized_primary_phone, display_name, lifecycle_state")
    .in("primary_phone", phones);

  if (error) {
    throw error;
  }

  const byPhone = new Map((data || []).map((row) => [row.primary_phone, row]));
  return byPhone;
}

async function findLegacyDemoProspect(spec, organizationId) {
  const normalizedPhone = normalizePhoneNumber(spec.primaryPhone);
  const storagePhone = formatPhoneForStorage(normalizedPhone);

  if (!normalizedPhone || !organizationId) {
    return null;
  }

  return (
    (await findProspectByNormalizedPhone(normalizedPhone, organizationId)) ||
    (await findProspectInOrganization(storagePhone, organizationId)) ||
    (await findProspectInOrganization(spec.primaryPhone, organizationId))
  );
}

function buildLegacyDemoProspectPayload(spec, coreRow, reviewUser) {
  const normalizedPhone = normalizePhoneNumber(spec.primaryPhone);
  const storagePhone = formatPhoneForStorage(normalizedPhone);
  const { firstName, lastName } = splitDisplayName(coreRow?.display_name || spec.displayName);
  const currentStep = resolveLegacyCurrentStep(spec);
  const lastEvent = spec.events?.[spec.events.length - 1];

  return {
    phone: storagePhone,
    normalized_phone: normalizedPhone,
    name: coreRow?.display_name || spec.displayName,
    first_name: firstName,
    last_name: lastName,
    organization_id: reviewUser.organization_id,
    owner_user_id: reviewUser.id,
    created_by_user_id: reviewUser.id,
    entry_method: META_REVIEW_ENTRY_METHOD,
    source: META_REVIEW_SOURCE,
    preferred_communication_channel: "WHATSAPP",
    communication_language: "en",
    language: "en",
    preferred_language: "english",
    status: currentStep,
    current_step: currentStep,
    last_message: lastEvent?.summary || "Meta Review demo prospect"
  };
}

async function upsertLegacyDemoProspect(spec, coreRow, reviewUser) {
  const payload = buildLegacyDemoProspectPayload(spec, coreRow, reviewUser);
  const existing = await findLegacyDemoProspect(spec, reviewUser.organization_id);

  if (existing) {
    const updatePayload = {
      owner_user_id: reviewUser.id,
      organization_id: reviewUser.organization_id,
      entry_method: META_REVIEW_ENTRY_METHOD,
      source: META_REVIEW_SOURCE,
      name: payload.name,
      first_name: payload.first_name,
      last_name: payload.last_name,
      normalized_phone: payload.normalized_phone,
      status: payload.status,
      current_step: payload.current_step,
      last_message: payload.last_message || existing.last_message
    };

    const { data, error } = await supabase
      .from("prospects")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("phone, owner_user_id, organization_id")
      .single();

    if (error) {
      throw error;
    }

    return { phone: data.phone, action: "updated" };
  }

  const insertPayload = {
    ...payload,
    prospect_number: await generateNextProspectNumber()
  };

  const { data, error } = await supabase
    .from("prospects")
    .insert(insertPayload)
    .select("phone, owner_user_id, organization_id")
    .single();

  if (error) {
    throw error;
  }

  return { phone: data.phone, action: "created" };
}

/**
 * Mirror Meta Review demo prospects into legacy `prospects` for the review user.
 * @param {{ id: string, organization_id: string }} reviewUser
 */
async function syncMetaReviewDemoProspectsToLegacy(reviewUser) {
  if (!isMetaReviewModeEnabled()) {
    return { skipped: true, reason: "META_REVIEW_MODE disabled" };
  }

  if (!reviewUser?.id || !reviewUser?.organization_id) {
    return { skipped: true, reason: "Review user missing id or organization_id" };
  }

  const coreByPhone = await loadCoreDemoProspects();
  const results = [];

  for (const spec of META_REVIEW_PROSPECTS) {
    const coreRow = coreByPhone.get(spec.primaryPhone) || null;

    results.push(await upsertLegacyDemoProspect(spec, coreRow, reviewUser));
  }

  console.info("[meta-review] Legacy demo prospect bridge synced", {
    reviewUserId: reviewUser.id,
    organizationId: reviewUser.organization_id,
    results
  });

  return {
    skipped: false,
    reviewUserId: reviewUser.id,
    results
  };
}

module.exports = {
  META_REVIEW_ENTRY_METHOD,
  META_REVIEW_SOURCE,
  syncMetaReviewDemoProspectsToLegacy
};
