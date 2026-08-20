/**
 * BR-145 — Canonical tenant billing / lifecycle service (single write path).
 */

const { supabase } = require("./supabaseService");
const { writeAuditLog } = require("../security/auditLogService");
const { addOneCalendarMonth, addCalendarDays } = require("../core/billingDateUtils");
const {
  TENANT_STATUS,
  DEFAULT_TRIAL_DAYS,
  MAX_TRIAL_DAYS,
  PAYMENT_METHODS,
  TEAM_VISION_ORGANIZATION_ID,
  normalizeTenantStatus,
  mapTenantStatusToOrganizationFields,
  deriveLifecycleStatusFromOrg,
  isTrialExpired,
  isTenantOperational,
  normalizePaymentMethod,
  normalizeCurrency
} = require("../core/tenantLifecycle");

let persistence = null;

function requireOrganizationId(organizationId) {
  if (!organizationId || typeof organizationId !== "string" || !organizationId.trim()) {
    const error = new Error("organizationId is required.");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }

  return organizationId.trim();
}

function defaultMetadata() {
  return {
    paymentLink: null,
    zelleInstructions: null,
    billingNotes: null,
    lastPaymentReference: null,
    lastAmountPaidCents: null,
    trialExtensionDays: 0,
    trialExtensions: [],
    payments: [],
    trialExpiredAt: null
  };
}

function normalizeMetadata(raw = {}) {
  const base = defaultMetadata();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  return {
    ...base,
    paymentLink: raw.paymentLink ?? base.paymentLink,
    zelleInstructions: raw.zelleInstructions ?? base.zelleInstructions,
    billingNotes: raw.billingNotes ?? base.billingNotes,
    lastPaymentReference: raw.lastPaymentReference ?? base.lastPaymentReference,
    lastAmountPaidCents:
      raw.lastAmountPaidCents == null ? base.lastAmountPaidCents : Number(raw.lastAmountPaidCents),
    trialExtensionDays: Number(raw.trialExtensionDays || 0),
    trialExtensions: Array.isArray(raw.trialExtensions) ? [...raw.trialExtensions] : [],
    payments: Array.isArray(raw.payments) ? [...raw.payments] : [],
    trialExpiredAt: raw.trialExpiredAt ?? base.trialExpiredAt
  };
}

function defaultSubscriptionRow(organizationId, overrides = {}) {
  const now = new Date().toISOString();
  return {
    organization_id: organizationId,
    plan: "professional",
    status: "active",
    renewal_date: null,
    limits: {},
    metadata: defaultMetadata(),
    trial_starts_at: null,
    trial_ends_at: null,
    monthly_price_cents: null,
    currency: "USD",
    payment_method: null,
    last_paid_at: null,
    next_due_at: null,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function defaultPersistence() {
  return {
    async loadOrganization(organizationId) {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },

    async loadSubscription(organizationId) {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },

    async saveOrganization(organizationId, patch) {
      const { data, error } = await supabase
        .from("organizations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", organizationId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async saveSubscription(organizationId, patch) {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .upsert(
          {
            organization_id: organizationId,
            ...patch,
            updated_at: new Date().toISOString()
          },
          { onConflict: "organization_id" }
        )
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return data;
    }
  };
}

function getPersistence() {
  return persistence || defaultPersistence();
}

function setBillingPersistenceForTests(override) {
  persistence = override;
}

function deriveBillingLifecycle(orgRow, subscriptionRow, now = new Date()) {
  const lifecycleStatus = deriveLifecycleStatusFromOrg(orgRow);

  if (
    lifecycleStatus === TENANT_STATUS.TRIAL &&
    isTrialExpired(subscriptionRow?.trial_ends_at, now)
  ) {
    return TENANT_STATUS.PAST_DUE;
  }

  return lifecycleStatus;
}

function presentPlatformBilling(orgRow, subscriptionRow, now = new Date()) {
  const metadata = normalizeMetadata(subscriptionRow?.metadata);
  const lifecycleStatus = deriveBillingLifecycle(orgRow, subscriptionRow, now);

  return {
    organizationId: orgRow.id,
    plan: subscriptionRow?.plan || orgRow.subscription_plan || null,
    lifecycleStatus,
    monthlyPriceCents: subscriptionRow?.monthly_price_cents ?? null,
    currency: subscriptionRow?.currency || "USD",
    paymentMethod: subscriptionRow?.payment_method || null,
    paymentLink: metadata.paymentLink,
    zelleInstructions: metadata.zelleInstructions,
    billingNotes: metadata.billingNotes,
    trialStartsAt: subscriptionRow?.trial_starts_at || null,
    trialEndsAt: subscriptionRow?.trial_ends_at || null,
    trialExtensionDays: metadata.trialExtensionDays,
    lastPaidAt: subscriptionRow?.last_paid_at || null,
    nextDueAt: subscriptionRow?.next_due_at || null,
    lastPaymentReference: metadata.lastPaymentReference,
    lastAmountPaidCents: metadata.lastAmountPaidCents,
    payments: metadata.payments,
    trialExtensions: metadata.trialExtensions,
    isOperational: isTenantOperational(lifecycleStatus, {
      trialEndsAt: subscriptionRow?.trial_ends_at,
      now
    })
  };
}

function presentTenantSafeBilling(orgRow, subscriptionRow, now = new Date()) {
  const platform = presentPlatformBilling(orgRow, subscriptionRow, now);

  return {
    plan: platform.plan,
    lifecycleStatus: platform.lifecycleStatus,
    monthlyPriceCents: platform.monthlyPriceCents,
    currency: platform.currency,
    paymentMethod: platform.paymentMethod,
    paymentLink:
      platform.paymentMethod === PAYMENT_METHODS.STRIPE ? platform.paymentLink : null,
    zelleInstructions:
      platform.paymentMethod === PAYMENT_METHODS.ZELLE ? platform.zelleInstructions : null,
    trialEndsAt: platform.trialEndsAt,
    lastPaidAt: platform.lastPaidAt,
    nextDueAt: platform.nextDueAt
  };
}

async function loadBillingContext(organizationId) {
  const store = getPersistence();
  const orgRow = await store.loadOrganization(organizationId);

  if (!orgRow) {
    const error = new Error("Organization not found.");
    error.statusCode = 404;
    error.publicCode = "ORGANIZATION_NOT_FOUND";
    throw error;
  }

  let subscriptionRow = await store.loadSubscription(organizationId);

  if (!subscriptionRow) {
    subscriptionRow = defaultSubscriptionRow(organizationId, {
      plan: orgRow.subscription_plan || "professional",
      status: orgRow.subscription_status || "active"
    });
    subscriptionRow = await store.saveSubscription(organizationId, subscriptionRow);
  }

  return { orgRow, subscriptionRow };
}

async function syncLifecycleMirror(organizationId, lifecycleStatus, subscriptionPatch = {}) {
  const store = getPersistence();
  const mapped = mapTenantStatusToOrganizationFields(lifecycleStatus);
  const now = new Date().toISOString();

  const orgRow = await store.saveOrganization(organizationId, {
    status: mapped.status,
    is_active: mapped.is_active,
    subscription_status: mapped.subscription_status,
    subscription_plan: subscriptionPatch.plan || undefined
  });

  const subscriptionRow = await store.saveSubscription(organizationId, {
    ...subscriptionPatch,
    status: mapped.subscription_status,
    plan: subscriptionPatch.plan || orgRow.subscription_plan || "professional"
  });

  return { orgRow, subscriptionRow };
}

function actorFromMeta(actor = {}) {
  return {
    userId: actor.userId || null,
    userEmail: actor.userEmail || null,
    ipAddress: actor.ipAddress || null,
    userAgent: actor.userAgent || null
  };
}

async function auditBilling(action, organizationId, actor, metadata = {}) {
  const meta = actorFromMeta(actor);
  await writeAuditLog({
    organizationId,
    userId: meta.userId,
    userEmail: meta.userEmail,
    action,
    targetType: "organization_subscription",
    targetId: organizationId,
    metadata,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent
  });
}

async function initializeBillingForNewTenant(organizationId, lifecycleStatusInput, createdAt) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const lifecycleStatus = normalizeTenantStatus(lifecycleStatusInput);
  const createdIso = createdAt || new Date().toISOString();
  const subscriptionPatch = {
    plan: "professional",
    metadata: defaultMetadata()
  };

  if (lifecycleStatus === TENANT_STATUS.TRIAL) {
    subscriptionPatch.trial_starts_at = createdIso;
    subscriptionPatch.trial_ends_at = addCalendarDays(createdIso, DEFAULT_TRIAL_DAYS);
  }

  return syncLifecycleMirror(organizationIdNorm, lifecycleStatus, subscriptionPatch);
}

async function setLifecycleStatus(organizationId, lifecycleStatusInput, auditMeta = {}) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const lifecycleStatus = normalizeTenantStatus(lifecycleStatusInput);
  const { orgRow, subscriptionRow } = await loadBillingContext(organizationIdNorm);
  const before = deriveBillingLifecycle(orgRow, subscriptionRow);

  const { orgRow: updatedOrg, subscriptionRow: updatedSub } = await syncLifecycleMirror(
    organizationIdNorm,
    lifecycleStatus,
    {
      plan: subscriptionRow.plan,
      metadata: subscriptionRow.metadata
    }
  );

  const after = deriveBillingLifecycle(updatedOrg, updatedSub);

  await auditBilling("platform.billing_status_changed", organizationIdNorm, auditMeta, {
    beforeLifecycle: before,
    afterLifecycle: after
  });

  return presentPlatformBilling(updatedOrg, updatedSub);
}

async function getBilling(organizationId) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const { orgRow, subscriptionRow } = await loadBillingContext(organizationIdNorm);
  return presentPlatformBilling(orgRow, subscriptionRow);
}

async function getTenantSafeBilling(organizationId) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const { orgRow, subscriptionRow } = await loadBillingContext(organizationIdNorm);
  return presentTenantSafeBilling(orgRow, subscriptionRow);
}

async function updateBilling(organizationId, patch = {}, auditMeta = {}) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const { orgRow, subscriptionRow } = await loadBillingContext(organizationIdNorm);
  const before = presentPlatformBilling(orgRow, subscriptionRow);
  const metadata = normalizeMetadata(subscriptionRow.metadata);
  const subscriptionPatch = {};

  if (Object.prototype.hasOwnProperty.call(patch, "plan")) {
    subscriptionPatch.plan = String(patch.plan || "").trim() || subscriptionRow.plan;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "monthlyPriceCents")) {
    const cents = Number(patch.monthlyPriceCents);
    if (!Number.isInteger(cents) || cents < 0) {
      const error = new Error("monthlyPriceCents must be a non-negative integer.");
      error.statusCode = 400;
      error.publicCode = "INVALID_MONTHLY_PRICE";
      throw error;
    }
    subscriptionPatch.monthly_price_cents = cents;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "currency")) {
    subscriptionPatch.currency = normalizeCurrency(patch.currency);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "paymentMethod")) {
    subscriptionPatch.payment_method =
      patch.paymentMethod == null ? null : normalizePaymentMethod(patch.paymentMethod);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "paymentLink")) {
    metadata.paymentLink = patch.paymentLink == null ? null : String(patch.paymentLink).trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "zelleInstructions")) {
    metadata.zelleInstructions =
      patch.zelleInstructions == null ? null : String(patch.zelleInstructions).trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "billingNotes")) {
    metadata.billingNotes =
      patch.billingNotes == null ? null : String(patch.billingNotes).trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "nextDueAt")) {
    subscriptionPatch.next_due_at = patch.nextDueAt || null;
  }

  subscriptionPatch.metadata = metadata;

  const lifecycleStatus = deriveBillingLifecycle(orgRow, {
    ...subscriptionRow,
    ...subscriptionPatch
  });

  const { orgRow: updatedOrg, subscriptionRow: updatedSub } = await syncLifecycleMirror(
    organizationIdNorm,
    lifecycleStatus,
    {
      ...subscriptionPatch,
      plan: subscriptionPatch.plan || subscriptionRow.plan
    }
  );

  const after = presentPlatformBilling(updatedOrg, updatedSub);

  await auditBilling("platform.billing_updated", organizationIdNorm, auditMeta, {
    changedFields: Object.keys(patch),
    beforeLifecycle: before.lifecycleStatus,
    afterLifecycle: after.lifecycleStatus
  });

  return after;
}

function maxTrialEndsAt(trialStartsAt) {
  return addCalendarDays(trialStartsAt, MAX_TRIAL_DAYS);
}

async function extendTrial(organizationId, daysInput, auditMeta = {}) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const days = Number(daysInput);

  if (!Number.isInteger(days) || days <= 0) {
    const error = new Error("days must be a positive integer.");
    error.statusCode = 400;
    error.publicCode = "INVALID_TRIAL_EXTENSION";
    throw error;
  }

  const { orgRow, subscriptionRow } = await loadBillingContext(organizationIdNorm);
  const lifecycleStatus = deriveLifecycleStatusFromOrg(orgRow);

  if (lifecycleStatus !== TENANT_STATUS.TRIAL) {
    const error = new Error("Trial extension is only available for TRIAL tenants.");
    error.statusCode = 400;
    error.publicCode = "TRIAL_EXTENSION_NOT_ALLOWED";
    throw error;
  }

  if (!subscriptionRow.trial_starts_at) {
    const error = new Error("Tenant has no trial start date.");
    error.statusCode = 400;
    error.publicCode = "TRIAL_START_REQUIRED";
    throw error;
  }

  const previousTrialEndsAt = subscriptionRow.trial_ends_at;
  const proposedEndsAt = addCalendarDays(previousTrialEndsAt || subscriptionRow.trial_starts_at, days);
  const cap = maxTrialEndsAt(subscriptionRow.trial_starts_at);

  if (new Date(proposedEndsAt).getTime() > new Date(cap).getTime()) {
    const error = new Error(`Trial may not exceed ${MAX_TRIAL_DAYS} days from trial start.`);
    error.statusCode = 400;
    error.publicCode = "TRIAL_EXTENSION_CAP_EXCEEDED";
    throw error;
  }

  const metadata = normalizeMetadata(subscriptionRow.metadata);
  metadata.trialExtensionDays = Number(metadata.trialExtensionDays || 0) + days;
  metadata.trialExtensions.push({
    days,
    previousTrialEndsAt,
    newTrialEndsAt: proposedEndsAt,
    extendedAt: new Date().toISOString(),
    extendedBy: auditMeta.userId || null
  });

  const { orgRow: updatedOrg, subscriptionRow: updatedSub } = await syncLifecycleMirror(
    organizationIdNorm,
    TENANT_STATUS.TRIAL,
    {
      plan: subscriptionRow.plan,
      trial_starts_at: subscriptionRow.trial_starts_at,
      trial_ends_at: proposedEndsAt,
      metadata
    }
  );

  await auditBilling("platform.billing_trial_extended", organizationIdNorm, auditMeta, {
    days,
    previousTrialEndsAt,
    newTrialEndsAt: proposedEndsAt
  });

  return presentPlatformBilling(updatedOrg, updatedSub);
}

async function markPaid(organizationId, payment = {}, auditMeta = {}) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const amountCents = Number(payment.amountCents);

  if (!Number.isInteger(amountCents) || amountCents < 0) {
    const error = new Error("amountCents must be a non-negative integer.");
    error.statusCode = 400;
    error.publicCode = "INVALID_PAYMENT_AMOUNT";
    throw error;
  }

  const reference =
    payment.reference == null ? null : String(payment.reference).trim() || null;
  const paidAt = payment.paidAt ? new Date(payment.paidAt).toISOString() : new Date().toISOString();

  if (Number.isNaN(new Date(paidAt).getTime())) {
    const error = new Error("paidAt must be a valid date.");
    error.statusCode = 400;
    error.publicCode = "INVALID_PAID_AT";
    throw error;
  }

  const { orgRow, subscriptionRow } = await loadBillingContext(organizationIdNorm);
  const lifecycleBefore = deriveBillingLifecycle(orgRow, subscriptionRow);
  const metadata = normalizeMetadata(subscriptionRow.metadata);

  let method = subscriptionRow.payment_method;

  if (payment.paymentMethod != null) {
    method = normalizePaymentMethod(payment.paymentMethod);
  }

  if (!method) {
    method = PAYMENT_METHODS.MANUAL;
  }

  metadata.lastPaymentReference = reference;
  metadata.lastAmountPaidCents = amountCents;

  if (payment.notes) {
    metadata.billingNotes = String(payment.notes).trim();
  }

  metadata.payments.push({
    paidAt,
    amountCents,
    reference,
    method,
    recordedBy: auditMeta.userId || null
  });

  const nextDueAt = addOneCalendarMonth(paidAt);
  let lifecycleAfter = lifecycleBefore;

  if (
    lifecycleBefore === TENANT_STATUS.TRIAL ||
    lifecycleBefore === TENANT_STATUS.PAST_DUE
  ) {
    lifecycleAfter = TENANT_STATUS.ACTIVE;
  } else if (lifecycleBefore === TENANT_STATUS.SUSPENDED) {
    lifecycleAfter = TENANT_STATUS.SUSPENDED;
  } else {
    lifecycleAfter = TENANT_STATUS.ACTIVE;
  }

  const { orgRow: updatedOrg, subscriptionRow: updatedSub } = await syncLifecycleMirror(
    organizationIdNorm,
    lifecycleAfter,
    {
      plan: subscriptionRow.plan,
      payment_method: method,
      last_paid_at: paidAt,
      next_due_at: nextDueAt,
      metadata
    }
  );

  await auditBilling("platform.billing_mark_paid", organizationIdNorm, auditMeta, {
    amountCents,
    reference,
    method,
    paidAt,
    beforeLifecycle: lifecycleBefore,
    afterLifecycle: lifecycleAfter,
    reactivated: lifecycleBefore === TENANT_STATUS.SUSPENDED ? false : lifecycleAfter === TENANT_STATUS.ACTIVE
  });

  return presentPlatformBilling(updatedOrg, updatedSub);
}

async function expireTrialIfNeeded(organizationId, auditMeta = {}) {
  const organizationIdNorm = requireOrganizationId(organizationId);
  const { orgRow, subscriptionRow } = await loadBillingContext(organizationIdNorm);
  const lifecycleStatus = deriveLifecycleStatusFromOrg(orgRow);
  const metadata = normalizeMetadata(subscriptionRow.metadata);

  if (lifecycleStatus === TENANT_STATUS.PAST_DUE || metadata.trialExpiredAt) {
    return {
      expired: lifecycleStatus === TENANT_STATUS.PAST_DUE,
      billing: presentPlatformBilling(orgRow, subscriptionRow)
    };
  }

  if (lifecycleStatus !== TENANT_STATUS.TRIAL) {
    return { expired: false, billing: presentPlatformBilling(orgRow, subscriptionRow) };
  }

  if (!subscriptionRow.trial_ends_at || !isTrialExpired(subscriptionRow.trial_ends_at)) {
    return { expired: false, billing: presentPlatformBilling(orgRow, subscriptionRow) };
  }

  metadata.trialExpiredAt = new Date().toISOString();

  const { orgRow: updatedOrg, subscriptionRow: updatedSub } = await syncLifecycleMirror(
    organizationIdNorm,
    TENANT_STATUS.PAST_DUE,
    {
      plan: subscriptionRow.plan,
      metadata
    }
  );

  await auditBilling("platform.billing_trial_expired", organizationIdNorm, auditMeta, {
    trialEndsAt: subscriptionRow.trial_ends_at,
    previousLifecycle: TENANT_STATUS.TRIAL,
    nextLifecycle: TENANT_STATUS.PAST_DUE
  });

  return {
    expired: true,
    billing: presentPlatformBilling(updatedOrg, updatedSub)
  };
}

function evaluateOperationalAccess(orgRow, subscriptionRow, now = new Date()) {
  const lifecycleStatus = deriveBillingLifecycle(orgRow, subscriptionRow, now);
  return isTenantOperational(lifecycleStatus, {
    trialEndsAt: subscriptionRow?.trial_ends_at,
    now
  });
}

module.exports = {
  TENANT_STATUS,
  TEAM_VISION_ORGANIZATION_ID,
  setBillingPersistenceForTests,
  deriveBillingLifecycle,
  presentPlatformBilling,
  presentTenantSafeBilling,
  initializeBillingForNewTenant,
  setLifecycleStatus,
  getBilling,
  getTenantSafeBilling,
  updateBilling,
  extendTrial,
  markPaid,
  expireTrialIfNeeded,
  syncLifecycleMirror,
  evaluateOperationalAccess,
  isTenantOperational,
  normalizePaymentMethod
};
