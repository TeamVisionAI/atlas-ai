/**
 * Platform billing dashboard helpers (BR-145 display only).
 * Does not change lifecycle rules; BR-146 seed checks are display-only.
 */

export const TEAM_VISION_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
export const MAX_TRIAL_DAYS = 10;
export const LIFECYCLE_FILTERS = Object.freeze([
  "ALL",
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED"
]);
export const PAYMENT_METHODS = Object.freeze(["STRIPE", "ZELLE", "MANUAL"]);
export const SUSPENDED_MARK_PAID_WARNING =
  "Recording this payment will not reactivate the tenant.";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function lifecycleOf(tenantOrBilling) {
  return String(tenantOrBilling?.lifecycleStatus || tenantOrBilling?.status || "")
    .trim()
    .toUpperCase();
}

export function isSeedTenant(tenant) {
  if (!tenant) {
    return false;
  }

  if (tenant.isSeedTenant === true) {
    return true;
  }

  return String(tenant.id || "").trim() === TEAM_VISION_ORGANIZATION_ID;
}

export function countLifecycleStatuses(tenants = []) {
  const counts = {
    ALL: tenants.length,
    TRIAL: 0,
    ACTIVE: 0,
    PAST_DUE: 0,
    SUSPENDED: 0
  };

  for (const tenant of tenants) {
    const status = lifecycleOf(tenant);
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }

  return counts;
}

export function filterTenantsByLifecycle(tenants = [], filter = "ALL") {
  const normalized = String(filter || "ALL").trim().toUpperCase();

  if (!normalized || normalized === "ALL") {
    return tenants;
  }

  return tenants.filter((tenant) => lifecycleOf(tenant) === normalized);
}

export function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function formatPrice(cents, currency = "USD") {
  if (cents == null || cents === "") {
    return "—";
  }

  const amount = Number(cents);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currency || "USD").toUpperCase()
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency || "USD"}`;
  }
}

export function formatPaymentMethod(method) {
  const normalized = String(method || "").trim().toUpperCase();
  return normalized || "—";
}

export function formatLifecycleBadge(status) {
  const normalized = String(status || "").trim().toUpperCase();

  if (normalized === "PAST_DUE") {
    return "PAST DUE";
  }

  return normalized || "—";
}

export function trialDaysRemaining(trialEndsAt, now = new Date()) {
  if (!trialEndsAt) {
    return null;
  }

  const end = new Date(trialEndsAt);

  if (Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY));
}

export function addCalendarDaysIso(isoInput, days) {
  const base = new Date(isoInput);

  if (Number.isNaN(base.getTime())) {
    return null;
  }

  const result = new Date(base);
  result.setUTCDate(result.getUTCDate() + Number(days));
  return result.toISOString();
}

export function maxTrialEndsAt(trialStartsAt) {
  if (!trialStartsAt) {
    return null;
  }

  return addCalendarDaysIso(trialStartsAt, MAX_TRIAL_DAYS);
}

export function trialExtensionCapacityRemaining(trialStartsAt, trialEndsAt) {
  const cap = maxTrialEndsAt(trialStartsAt);

  if (!cap) {
    return 0;
  }

  const currentEnd = trialEndsAt ? new Date(trialEndsAt) : new Date(trialStartsAt);

  if (Number.isNaN(currentEnd.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((new Date(cap).getTime() - currentEnd.getTime()) / MS_PER_DAY));
}

export function clampExtendTrialDays(requestedDays, capacityRemaining) {
  const requested = Number(requestedDays);
  const capacity = Number(capacityRemaining);

  if (!Number.isInteger(requested) || requested <= 0 || capacity <= 0) {
    return 0;
  }

  return Math.min(requested, capacity);
}

export function trialDueLabel(tenant, now = new Date()) {
  if (isSeedTenant(tenant)) {
    return "—";
  }

  const status = lifecycleOf(tenant);

  if (status === "TRIAL") {
    const days = trialDaysRemaining(tenant.trialEndsAt, now);
    const end = formatDate(tenant.trialEndsAt);

    if (days == null) {
      return end;
    }

    const unit = days === 1 ? "day" : "days";
    return `${days} ${unit} remaining · ${end}`;
  }

  if (status === "PAST_DUE") {
    return `Past due · ${formatDate(tenant.nextDueAt || tenant.trialEndsAt)}`;
  }

  if (status === "SUSPENDED") {
    return "Suspended";
  }

  return "—";
}

export function nextDueLabel(tenant) {
  if (lifecycleOf(tenant) === "SUSPENDED" && !tenant?.nextDueAt) {
    return "—";
  }

  if (lifecycleOf(tenant) === "ACTIVE" || lifecycleOf(tenant) === "PAST_DUE") {
    return formatDate(tenant?.nextDueAt);
  }

  return formatDate(tenant?.nextDueAt);
}

export function canShowExtendTrial(tenant) {
  return !isSeedTenant(tenant) && lifecycleOf(tenant) === "TRIAL";
}

export function canShowSeedDestructiveActions(tenant) {
  return !isSeedTenant(tenant);
}

export function isPastDue(tenantOrBilling) {
  return lifecycleOf(tenantOrBilling) === "PAST_DUE";
}

export function paymentDueBannerVisible(billing) {
  return isPastDue(billing);
}

export function shouldShowStripeField(paymentMethod, savedPaymentLink = null) {
  if (String(paymentMethod || "").toUpperCase() === "STRIPE") {
    return { visible: true, readOnly: false };
  }

  if (String(paymentMethod || "").toUpperCase() === "MANUAL" && savedPaymentLink) {
    return { visible: true, readOnly: true };
  }

  return { visible: false, readOnly: true };
}

export function shouldShowZelleField(paymentMethod, savedZelleInstructions = null) {
  if (String(paymentMethod || "").toUpperCase() === "ZELLE") {
    return { visible: true, readOnly: false };
  }

  if (String(paymentMethod || "").toUpperCase() === "MANUAL" && savedZelleInstructions) {
    return { visible: true, readOnly: true };
  }

  return { visible: false, readOnly: true };
}

export function dollarsToCents(dollars) {
  const value = Number(dollars);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100);
}

export function centsToDollarsInput(cents) {
  if (cents == null || cents === "") {
    return "";
  }

  const value = Number(cents);

  if (!Number.isFinite(value)) {
    return "";
  }

  return (value / 100).toFixed(2);
}

export function dateInputValue(iso) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function dateInputToIso(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildBillingPatch(form = {}) {
  const monthlyPriceCents = Object.prototype.hasOwnProperty.call(form, "monthlyPriceCents")
    ? form.monthlyPriceCents
    : dollarsToCents(form.monthlyPrice);

  const payload = {
    plan: String(form.plan || "").trim() || null,
    monthlyPriceCents,
    currency: String(form.currency || "USD").trim().toUpperCase() || "USD",
    paymentMethod: String(form.paymentMethod || "").trim().toUpperCase() || null,
    paymentLink: form.paymentLink == null ? null : String(form.paymentLink).trim() || null,
    zelleInstructions:
      form.zelleInstructions == null ? null : String(form.zelleInstructions).trim() || null,
    billingNotes: form.billingNotes == null ? null : String(form.billingNotes).trim() || null,
    nextDueAt: form.nextDueAt ? dateInputToIso(form.nextDueAt) || form.nextDueAt : null
  };

  return payload;
}

export function billingPatchOmitsOrganizationId(payload) {
  return (
    payload &&
    !Object.prototype.hasOwnProperty.call(payload, "organizationId") &&
    !Object.prototype.hasOwnProperty.call(payload, "organization_id")
  );
}

export function buildExtendTrialPayload(days, capacityRemaining) {
  return { days: clampExtendTrialDays(days, capacityRemaining) };
}

export function buildMarkPaidPayload({ amountDollars, amountCents, reference, paidAt, notes } = {}) {
  const cents =
    amountCents != null ? Number(amountCents) : dollarsToCents(amountDollars);

  const payload = {
    amountCents: cents,
    reference: String(reference || "").trim()
  };

  if (paidAt) {
    payload.paidAt = dateInputToIso(paidAt) || paidAt;
  }

  if (notes) {
    payload.notes = String(notes).trim();
  }

  return payload;
}

export function showSuspendedMarkPaidWarning(lifecycleStatus) {
  return lifecycleOf({ lifecycleStatus }) === "SUSPENDED";
}

export function mergeTenantWithBilling(tenant, billing) {
  if (!tenant || !billing) {
    return tenant;
  }

  return {
    ...tenant,
    lifecycleStatus: billing.lifecycleStatus || tenant.lifecycleStatus,
    plan: billing.plan || tenant.plan,
    subscriptionPlan: billing.plan || tenant.subscriptionPlan,
    monthlyPriceCents: billing.monthlyPriceCents ?? tenant.monthlyPriceCents,
    currency: billing.currency || tenant.currency,
    paymentMethod: billing.paymentMethod || tenant.paymentMethod,
    trialStartsAt: billing.trialStartsAt ?? tenant.trialStartsAt,
    trialEndsAt: billing.trialEndsAt ?? tenant.trialEndsAt,
    lastPaidAt: billing.lastPaidAt ?? tenant.lastPaidAt,
    nextDueAt: billing.nextDueAt ?? tenant.nextDueAt
  };
}

export function displayValue(value) {
  if (value == null || value === "") {
    return "—";
  }

  return value;
}
