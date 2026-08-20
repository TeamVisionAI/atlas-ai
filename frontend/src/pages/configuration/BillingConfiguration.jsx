import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import { canAccessBillingSettings } from "../../security/billingSettingsAccess";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import { fetchOrganizationBilling } from "../../services/organizationBillingService";
import {
  displayValue,
  formatDate,
  formatLifecycleBadge,
  formatPaymentMethod,
  formatPrice,
  paymentDueBannerVisible,
  shouldShowStripeField,
  shouldShowZelleField
} from "../platform/platformBillingHelpers";

export default function BillingConfiguration() {
  const { translate } = useLanguage();
  const { user } = useWorkspace();
  const allowed = canAccessBillingSettings(user);

  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await fetchOrganizationBilling();
    return result.billing || result;
  }, []);

  useEffect(() => {
    if (!allowed) {
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    load()
      .then((loaded) => {
        if (!cancelled) {
          setBilling(loaded);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || translate("billingConfigLoadError"));
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
  }, [allowed, load, translate]);

  if (!allowed) {
    return null;
  }

  if (loading) {
    return <ConfigurationLoading />;
  }

  const stripeField = shouldShowStripeField(billing?.paymentMethod, billing?.paymentLink);
  const zelleField = shouldShowZelleField(billing?.paymentMethod, billing?.zelleInstructions);

  return (
    <div className="configuration-billing" data-testid="tenant-billing-page">
      <header className="configuration-recruiting-header">
        <div className="configuration-recruiting-header__titles">
          <h2 className="configuration-card__title">{SETTINGS_SECTIONS.billing}</h2>
        </div>
        <span className="configuration-badge configuration-badge--muted">
          {translate("billingConfigReadOnly")}
        </span>
      </header>

      {paymentDueBannerVisible(billing) ? (
        <p className="configuration-message configuration-message--error" data-testid="tenant-billing-payment-due" role="status">
          <strong>{translate("billingConfigPaymentDue")}</strong>
          {" — "}
          {translate("billingConfigPaymentDueGuidance")}
        </p>
      ) : null}

      {error ? (
        <p className="configuration-message configuration-message--error" role="alert">
          {error}
        </p>
      ) : null}

      <ConfigurationSection title={translate("billingConfigLifecycle")}>
        <dl className="platform-tenants-page__detail configuration-billing__detail">
          <div>
            <dt>{translate("billingConfigPlan")}</dt>
            <dd>{displayValue(billing?.plan)}</dd>
          </div>
          <div>
            <dt>{translate("billingConfigLifecycle")}</dt>
            <dd>{formatLifecycleBadge(billing?.lifecycleStatus)}</dd>
          </div>
          <div>
            <dt>{translate("billingConfigMonthlyPrice")}</dt>
            <dd>{formatPrice(billing?.monthlyPriceCents, billing?.currency)}</dd>
          </div>
          <div>
            <dt>{translate("billingConfigCurrency")}</dt>
            <dd>{displayValue(billing?.currency)}</dd>
          </div>
          <div>
            <dt>{translate("billingConfigPaymentMethod")}</dt>
            <dd>{formatPaymentMethod(billing?.paymentMethod)}</dd>
          </div>
          <div>
            <dt>{translate("billingConfigTrialEnd")}</dt>
            <dd>{formatDate(billing?.trialEndsAt)}</dd>
          </div>
          <div>
            <dt>{translate("billingConfigLastPaid")}</dt>
            <dd>{formatDate(billing?.lastPaidAt)}</dd>
          </div>
          <div>
            <dt>{translate("billingConfigNextDue")}</dt>
            <dd>{formatDate(billing?.nextDueAt)}</dd>
          </div>
          {stripeField.visible && billing?.paymentLink ? (
            <div data-testid="tenant-billing-stripe">
              <dt>{translate("billingConfigPaymentLink")}</dt>
              <dd>
                <a href={billing.paymentLink} target="_blank" rel="noreferrer">
                  {billing.paymentLink}
                </a>
              </dd>
            </div>
          ) : null}
          {zelleField.visible && billing?.zelleInstructions ? (
            <div data-testid="tenant-billing-zelle">
              <dt>{translate("billingConfigZelleInstructions")}</dt>
              <dd>{billing.zelleInstructions}</dd>
            </div>
          ) : null}
        </dl>
      </ConfigurationSection>
    </div>
  );
}
