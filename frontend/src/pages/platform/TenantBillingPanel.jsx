import { useEffect, useMemo, useState } from "react";
import {
  extendTenantTrial,
  getTenantBilling,
  markTenantPaid,
  updateTenantBilling
} from "../../services/platformService";
import {
  MAX_TRIAL_DAYS,
  PAYMENT_METHODS,
  SUSPENDED_MARK_PAID_WARNING,
  billingPatchOmitsOrganizationId,
  buildBillingPatch,
  buildExtendTrialPayload,
  buildMarkPaidPayload,
  canShowExtendTrial,
  centsToDollarsInput,
  clampExtendTrialDays,
  dateInputValue,
  displayValue,
  formatDate,
  formatDateTime,
  formatLifecycleBadge,
  formatPaymentMethod,
  formatPrice,
  isSeedTenant,
  maxTrialEndsAt,
  mergeTenantWithBilling,
  shouldShowStripeField,
  shouldShowZelleField,
  showSuspendedMarkPaidWarning,
  trialDaysRemaining,
  trialExtensionCapacityRemaining
} from "./platformBillingHelpers";

function emptyEditForm() {
  return {
    plan: "",
    monthlyPrice: "",
    currency: "USD",
    paymentMethod: "",
    paymentLink: "",
    zelleInstructions: "",
    billingNotes: "",
    nextDueAt: ""
  };
}

function formFromBilling(billing) {
  return {
    plan: billing?.plan || "",
    monthlyPrice: centsToDollarsInput(billing?.monthlyPriceCents),
    currency: billing?.currency || "USD",
    paymentMethod: billing?.paymentMethod || "",
    paymentLink: billing?.paymentLink || "",
    zelleInstructions: billing?.zelleInstructions || "",
    billingNotes: billing?.billingNotes || "",
    nextDueAt: dateInputValue(billing?.nextDueAt)
  };
}

export default function TenantBillingPanel({ tenant, onClose, onTenantUpdated }) {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [extending, setExtending] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [form, setForm] = useState(emptyEditForm);
  const [extendDays, setExtendDays] = useState(1);
  const [paidForm, setPaidForm] = useState({
    amountDollars: "",
    reference: "",
    paidAt: "",
    notes: ""
  });

  const seed = isSeedTenant(tenant);
  const showExtend = canShowExtendTrial({ ...tenant, ...billing, id: tenant?.id, isSeedTenant: seed });
  const capacity = trialExtensionCapacityRemaining(billing?.trialStartsAt, billing?.trialEndsAt);
  const stripeField = shouldShowStripeField(form.paymentMethod, billing?.paymentLink);
  const zelleField = shouldShowZelleField(form.paymentMethod, billing?.zelleInstructions);
  const suspendedWarning = showSuspendedMarkPaidWarning(billing?.lifecycleStatus);

  const overview = useMemo(() => billing, [billing]);

  useEffect(() => {
    if (!tenant?.id) {
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setNotice("");

    getTenantBilling(tenant.id)
      .then((result) => {
        if (cancelled) {
          return;
        }

        const loaded = result.billing || result;
        setBilling(loaded);
        setForm(formFromBilling(loaded));
        const remaining = trialExtensionCapacityRemaining(loaded.trialStartsAt, loaded.trialEndsAt);
        setExtendDays(remaining > 0 ? 1 : 0);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Unable to load billing.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  async function handleSave(event) {
    event.preventDefault();
    const payload = buildBillingPatch(form);

    if (!billingPatchOmitsOrganizationId(payload)) {
      setError("Billing patch must not include organizationId.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await updateTenantBilling(tenant.id, payload);
      const loaded = result.billing || result;
      setBilling(loaded);
      setForm(formFromBilling(loaded));
      setNotice("Billing saved.");
      onTenantUpdated?.(mergeTenantWithBilling(tenant, loaded));
    } catch (err) {
      setError(err.message || "Unable to save billing.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExtend(event) {
    event.preventDefault();
    const payload = buildExtendTrialPayload(extendDays, capacity);

    if (!payload.days) {
      setError("No trial extension capacity remaining.");
      return;
    }

    setExtending(true);
    setError("");
    setNotice("");

    try {
      const result = await extendTenantTrial(tenant.id, payload);
      const loaded = result.billing || result;
      setBilling(loaded);
      setForm(formFromBilling(loaded));
      setNotice("Trial extended.");
      onTenantUpdated?.(mergeTenantWithBilling(tenant, loaded));
    } catch (err) {
      setError(err.message || "Unable to extend trial.");
    } finally {
      setExtending(false);
    }
  }

  async function handleMarkPaid(event) {
    event.preventDefault();

    if (suspendedWarning) {
      const confirmed = window.confirm(SUSPENDED_MARK_PAID_WARNING);
      if (!confirmed) {
        return;
      }
    }

    const payload = buildMarkPaidPayload(paidForm);

    setMarkingPaid(true);
    setError("");
    setNotice("");

    try {
      const result = await markTenantPaid(tenant.id, payload);
      const loaded = result.billing || result;
      setBilling(loaded);
      setForm(formFromBilling(loaded));
      setPaidForm({ amountDollars: "", reference: "", paidAt: "", notes: "" });
      setNotice("Payment recorded.");
      onTenantUpdated?.(mergeTenantWithBilling(tenant, loaded));
    } catch (err) {
      setError(err.message || "Unable to record payment.");
    } finally {
      setMarkingPaid(false);
    }
  }

  if (!tenant) {
    return null;
  }

  return (
    <section className="identity-card platform-billing-panel" data-testid="billing-panel">
      <div className="platform-billing-panel__header">
        <h2>View Billing — {tenant.name}</h2>
        <button type="button" className="identity-button-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? <p>Loading billing…</p> : null}
      {error ? <p className="identity-error">{error}</p> : null}
      {notice ? <p className="identity-success">{notice}</p> : null}

      {overview ? (
        <>
          <h3>Billing overview</h3>
          <dl className="platform-tenants-page__detail">
            <div>
              <dt>Lifecycle</dt>
              <dd data-testid="billing-lifecycle">{formatLifecycleBadge(overview.lifecycleStatus)}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{displayValue(overview.plan)}</dd>
            </div>
            <div>
              <dt>Monthly price</dt>
              <dd>{formatPrice(overview.monthlyPriceCents, overview.currency)}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{displayValue(overview.currency)}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{formatPaymentMethod(overview.paymentMethod)}</dd>
            </div>
            <div>
              <dt>Trial start</dt>
              <dd>{seed ? "—" : formatDate(overview.trialStartsAt)}</dd>
            </div>
            <div>
              <dt>Trial end</dt>
              <dd>{seed ? "—" : formatDate(overview.trialEndsAt)}</dd>
            </div>
            <div>
              <dt>Last paid</dt>
              <dd>{formatDate(overview.lastPaidAt)}</dd>
            </div>
            <div>
              <dt>Next due</dt>
              <dd>{formatDate(overview.nextDueAt)}</dd>
            </div>
          </dl>

          <h3>Payment settings</h3>
          <form className="identity-form" onSubmit={handleSave} data-testid="billing-edit-form">
            <label>
              Plan
              <input
                value={form.plan}
                onChange={(event) => setForm((current) => ({ ...current, plan: event.target.value }))}
              />
            </label>
            <label>
              Monthly price
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyPrice}
                onChange={(event) =>
                  setForm((current) => ({ ...current, monthlyPrice: event.target.value }))
                }
              />
            </label>
            <label>
              Currency
              <input
                value={form.currency}
                onChange={(event) =>
                  setForm((current) => ({ ...current, currency: event.target.value }))
                }
              />
            </label>
            <label>
              Payment method
              <select
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm((current) => ({ ...current, paymentMethod: event.target.value }))
                }
              >
                <option value="">—</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            {stripeField.visible ? (
              <label data-testid="stripe-payment-link">
                Stripe payment link
                <input
                  value={form.paymentLink}
                  readOnly={stripeField.readOnly}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, paymentLink: event.target.value }))
                  }
                />
              </label>
            ) : null}
            {zelleField.visible ? (
              <label data-testid="zelle-instructions">
                Zelle instructions
                <textarea
                  rows={3}
                  value={form.zelleInstructions}
                  readOnly={zelleField.readOnly}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, zelleInstructions: event.target.value }))
                  }
                />
              </label>
            ) : null}
            <label>
              Internal billing notes
              <textarea
                rows={3}
                value={form.billingNotes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, billingNotes: event.target.value }))
                }
              />
            </label>
            <label>
              Next due date
              <input
                type="date"
                value={form.nextDueAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, nextDueAt: event.target.value }))
                }
              />
            </label>
            <div className="identity-actions">
              <button type="submit" className="identity-button" disabled={saving}>
                {saving ? "Saving…" : "Save billing"}
              </button>
            </div>
          </form>

          {Array.isArray(overview.payments) && overview.payments.length ? (
            <>
              <h3>Payment history</h3>
              <div className="identity-table-wrap">
                <table className="identity-table">
                  <thead>
                    <tr>
                      <th>Paid date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.payments.map((payment, index) => (
                      <tr key={`${payment.reference || "pay"}-${index}`}>
                        <td>{formatDateTime(payment.paidAt)}</td>
                        <td>{formatPrice(payment.amountCents, overview.currency)}</td>
                        <td>{formatPaymentMethod(payment.method)}</td>
                        <td>{displayValue(payment.reference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {Array.isArray(overview.trialExtensions) && overview.trialExtensions.length ? (
            <>
              <h3>Trial extension history</h3>
              <ul className="platform-billing-panel__history">
                {overview.trialExtensions.map((entry, index) => (
                  <li key={`${entry.extendedAt || "ext"}-${index}`}>
                    {entry.days} day{entry.days === 1 ? "" : "s"} · {formatDateTime(entry.extendedAt)}{" "}
                    · {formatDate(entry.previousTrialEndsAt)} → {formatDate(entry.newTrialEndsAt)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {showExtend ? (
            <form className="identity-form" onSubmit={handleExtend} data-testid="billing-extend-trial">
              <h3>Extend trial</h3>
              <p>
                Trial start: {formatDate(overview.trialStartsAt)} · Current end:{" "}
                {formatDate(overview.trialEndsAt)} · Max allowed end:{" "}
                {formatDate(maxTrialEndsAt(overview.trialStartsAt))}
              </p>
              <p data-testid="trial-capacity">
                {trialDaysRemaining(overview.trialEndsAt) ?? 0} days remaining · {capacity} day
                {capacity === 1 ? "" : "s"} extension capacity remaining (max {MAX_TRIAL_DAYS} days
                from start)
              </p>
              <label>
                Days to extend
                <input
                  type="number"
                  min="1"
                  max={Math.max(capacity, 0)}
                  value={extendDays}
                  disabled={capacity <= 0}
                  onChange={(event) =>
                    setExtendDays(clampExtendTrialDays(Number(event.target.value), capacity) || Number(event.target.value))
                  }
                />
              </label>
              <div className="identity-actions">
                <button
                  type="submit"
                  className="identity-button"
                  disabled={extending || capacity <= 0}
                >
                  {extending ? "Extending…" : "Extend Trial"}
                </button>
              </div>
            </form>
          ) : null}

          <form className="identity-form" onSubmit={handleMarkPaid} data-testid="billing-mark-paid">
            <h3>Mark paid</h3>
            <p>Configured payment method: {formatPaymentMethod(overview.paymentMethod)}</p>
            {suspendedWarning ? (
              <p className="platform-tenants-page__suspended-hint" data-testid="billing-suspended-warning">
                {SUSPENDED_MARK_PAID_WARNING}
              </p>
            ) : null}
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={paidForm.amountDollars}
                onChange={(event) =>
                  setPaidForm((current) => ({ ...current, amountDollars: event.target.value }))
                }
              />
            </label>
            <label>
              Reference
              <input
                required
                value={paidForm.reference}
                onChange={(event) =>
                  setPaidForm((current) => ({ ...current, reference: event.target.value }))
                }
              />
            </label>
            <label>
              Paid date
              <input
                type="date"
                value={paidForm.paidAt}
                onChange={(event) =>
                  setPaidForm((current) => ({ ...current, paidAt: event.target.value }))
                }
              />
            </label>
            <label>
              Notes
              <textarea
                rows={2}
                value={paidForm.notes}
                onChange={(event) =>
                  setPaidForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
            <div className="identity-actions">
              <button type="submit" className="identity-button" disabled={markingPaid}>
                {markingPaid ? "Recording…" : "Mark Paid"}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
