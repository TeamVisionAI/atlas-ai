/**
 * BR-181 — Client Production presentation helpers.
 */

export const PRODUCTION_ACTIVITY_TYPES = Object.freeze({
  LIFE: "LIFE",
  INVESTMENT: "INVESTMENT",
  ANNUITY: "ANNUITY",
  POLICY_REVIEW: "POLICY_REVIEW",
  OTHER: "OTHER"
});

export const PRODUCTION_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  PENDING: "PENDING",
  ISSUED: "ISSUED",
  PAID: "PAID",
  DECLINED: "DECLINED",
  WITHDRAWN: "WITHDRAWN",
  CLOSED: "CLOSED"
});

const TYPE_LABEL_KEYS = Object.freeze({
  LIFE: "productionTypeLife",
  INVESTMENT: "productionTypeInvestment",
  ANNUITY: "productionTypeAnnuity",
  POLICY_REVIEW: "productionTypePolicyReview",
  OTHER: "productionTypeOther"
});

const STATUS_LABEL_KEYS = Object.freeze({
  DRAFT: "productionStatusDraft",
  SUBMITTED: "productionStatusSubmitted",
  PENDING: "productionStatusPending",
  ISSUED: "productionStatusIssued",
  PAID: "productionStatusPaid",
  DECLINED: "productionStatusDeclined",
  WITHDRAWN: "productionStatusWithdrawn",
  CLOSED: "productionStatusClosed"
});

export function buildProductionTypeLabel(type, translate) {
  const key = TYPE_LABEL_KEYS[String(type || "").toUpperCase()] || "productionTypeOther";
  return translate(key);
}

export function buildProductionStatusLabel(status, translate) {
  const key = STATUS_LABEL_KEYS[String(status || "").toUpperCase()] || "productionStatusDraft";
  return translate(key);
}

export function productionStatusVariant(status) {
  switch (String(status || "").toUpperCase()) {
    case "PAID":
    case "ISSUED":
      return "success";
    case "SUBMITTED":
    case "PENDING":
      return "warning";
    case "DECLINED":
    case "WITHDRAWN":
      return "danger";
    case "CLOSED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function formatProductionAmount(amount, locale = "en-US", currency = "USD") {
  if (amount == null || amount === "") return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const code = /^[A-Z]{3}$/.test(String(currency || "").trim().toUpperCase())
    ? String(currency).trim().toUpperCase()
    : "USD";
  return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
}

export function presentProductionKpiMoney(kpis, locale = "en-US") {
  const byCurrency = kpis?.monetaryByCurrency || {};
  const currencies = Object.keys(byCurrency);
  if (kpis?.mixedCurrency || currencies.length > 1) {
    return currencies.map((currency) => {
      const row = byCurrency[currency];
      return {
        currency,
        productionLabel: formatProductionAmount(row.production, locale, currency),
        averageLabel: formatProductionAmount(row.averagePremium, locale, currency)
      };
    });
  }
  const currency = kpis?.currency || currencies[0] || "USD";
  const production = kpis?.personalProduction;
  return [
    {
      currency,
      productionLabel: formatProductionAmount(production, locale, currency),
      averageLabel: formatProductionAmount(kpis?.averagePremium, locale, currency)
    }
  ];
}

export function formatProductionTimestamp(value, locale = "en-US") {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function presentProductionHistoryEvent(event = {}, translate, locale) {
  return {
    ...event,
    actorLabel: event.actorName || translate("productionFormerTeammate"),
    atLabel: formatProductionTimestamp(event.at, locale),
    summary: event.summary || translate("productionHistoryEvent")
  };
}

export function emptyProductionForm(overrides = {}) {
  return {
    clientId: "",
    activityType: PRODUCTION_ACTIVITY_TYPES.LIFE,
    status: PRODUCTION_STATUSES.DRAFT,
    carrier: "",
    productType: "",
    amount: "",
    notes: "",
    dueDate: "",
    dueTime: "",
    title: "",
    ...overrides
  };
}
