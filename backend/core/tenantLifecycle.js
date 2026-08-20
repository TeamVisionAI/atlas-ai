/**
 * BR-145 — Canonical SaaS tenant lifecycle (platform billing).
 */

const TENANT_STATUS = Object.freeze({
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  SUSPENDED: "SUSPENDED"
});

const ALL_TENANT_STATUSES = Object.freeze(Object.values(TENANT_STATUS));

const DEFAULT_TRIAL_DAYS = 7;
const MAX_TRIAL_DAYS = 10;

const PAYMENT_METHODS = Object.freeze({
  STRIPE: "STRIPE",
  ZELLE: "ZELLE",
  MANUAL: "MANUAL"
});

const ALL_PAYMENT_METHODS = Object.freeze(Object.values(PAYMENT_METHODS));

const TEAM_VISION_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

function normalizeTenantStatus(value) {
  const status = String(value || TENANT_STATUS.ACTIVE)
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");

  if (!ALL_TENANT_STATUSES.includes(status)) {
    const error = new Error("Invalid tenant status.");
    error.statusCode = 400;
    error.publicCode = "INVALID_TENANT_STATUS";
    throw error;
  }

  return status;
}

function mapTenantStatusToOrganizationFields(lifecycleStatus) {
  switch (lifecycleStatus) {
    case TENANT_STATUS.TRIAL:
      return {
        status: "trial",
        is_active: true,
        subscription_status: "trial"
      };
    case TENANT_STATUS.PAST_DUE:
      return {
        status: "past_due",
        is_active: true,
        subscription_status: "past_due"
      };
    case TENANT_STATUS.SUSPENDED:
      return {
        status: "suspended",
        is_active: false,
        subscription_status: "suspended"
      };
    case TENANT_STATUS.ACTIVE:
    default:
      return {
        status: "active",
        is_active: true,
        subscription_status: "active"
      };
  }
}

function deriveLifecycleStatusFromOrg(row = {}) {
  const subscription = String(row.subscription_status || "").toLowerCase();
  const status = String(row.status || "").toLowerCase();

  if (row.is_active === false || status === "suspended" || subscription === "suspended") {
    return TENANT_STATUS.SUSPENDED;
  }

  if (status === "past_due" || subscription === "past_due") {
    return TENANT_STATUS.PAST_DUE;
  }

  if (status === "trial" || subscription === "trial") {
    return TENANT_STATUS.TRIAL;
  }

  return TENANT_STATUS.ACTIVE;
}

function isTrialExpired(trialEndsAt, now = new Date()) {
  if (!trialEndsAt) {
    return false;
  }

  return new Date(trialEndsAt).getTime() <= now.getTime();
}

function isTenantOperational(lifecycleStatus, { trialEndsAt, now } = {}) {
  if (lifecycleStatus === TENANT_STATUS.SUSPENDED) {
    return false;
  }

  if (lifecycleStatus === TENANT_STATUS.PAST_DUE || lifecycleStatus === TENANT_STATUS.ACTIVE) {
    return true;
  }

  if (lifecycleStatus === TENANT_STATUS.TRIAL) {
    return !isTrialExpired(trialEndsAt, now);
  }

  return false;
}

function normalizePaymentMethod(value) {
  if (value == null || value === "") {
    return null;
  }

  const method = String(value).trim().toUpperCase();

  if (!ALL_PAYMENT_METHODS.includes(method)) {
    const error = new Error("Invalid payment method.");
    error.statusCode = 400;
    error.publicCode = "INVALID_PAYMENT_METHOD";
    throw error;
  }

  return method;
}

function normalizeCurrency(value) {
  const currency = String(value || "USD")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    const error = new Error("Invalid currency.");
    error.statusCode = 400;
    error.publicCode = "INVALID_CURRENCY";
    throw error;
  }

  return currency;
}

module.exports = {
  TENANT_STATUS,
  ALL_TENANT_STATUSES,
  DEFAULT_TRIAL_DAYS,
  MAX_TRIAL_DAYS,
  PAYMENT_METHODS,
  ALL_PAYMENT_METHODS,
  TEAM_VISION_ORGANIZATION_ID,
  normalizeTenantStatus,
  mapTenantStatusToOrganizationFields,
  deriveLifecycleStatusFromOrg,
  isTrialExpired,
  isTenantOperational,
  normalizePaymentMethod,
  normalizeCurrency
};
