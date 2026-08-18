import { formatClassifiedValue, VALUE_CLASSIFICATIONS } from "./classifiedValueDisplay";
import { collectPages, formatSourceLine } from "./sourceReferences";

const DEFAULT_CARRIER_TEXT =
  "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.";

function limitLine(limits = {}) {
  const parts = [];
  if (limits.minAccelerationDollars != null) {
    parts.push(`Minimum ${Number(limits.minAccelerationDollars).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`);
  }
  if (limits.maxAccelerationPercent != null) {
    parts.push(`Up to ${limits.maxAccelerationPercent}%`);
  }
  if (limits.maxAccelerationDollars != null) {
    parts.push(
      `Max ${Number(limits.maxAccelerationDollars).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      })}`
    );
  }
  if (limits.monthlyLimit != null) {
    parts.push(
      `Monthly cap ${Number(limits.monthlyLimit).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      })}`
    );
  }
  if (limits.monthlyLimitPercent != null) {
    parts.push(`Monthly ${limits.monthlyLimitPercent}%`);
  }
  if (limits.annualLimitPercent != null) {
    parts.push(`${limits.annualLimitPercent}% annual / per-event limit`);
  }
  if (limits.annualLimitDollars != null) {
    parts.push(
      `Annual / event cap ${Number(limits.annualLimitDollars).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      })}`
    );
  }
  if (limits.eventLimits?.perEventDollars != null) {
    parts.push(
      `Per event ${Number(limits.eventLimits.perEventDollars).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      })}`
    );
  }
  if (limits.maxClaims != null) {
    parts.push(`Max claims ${limits.maxClaims}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function chargeText(charges) {
  if (!charges || typeof charges !== "object") {
    return null;
  }
  if (charges.classification && charges.value == null) {
    return formatClassifiedValue(charges).text;
  }
  const bits = [];
  if (charges.extraPremium === 0) {
    bits.push("No additional premium (explicit)");
  }
  if (charges.upfrontCharge === 0) {
    bits.push("No upfront rider charge (explicit)");
  }
  if (charges.amount != null) {
    bits.push(formatClassifiedValue({ value: charges.amount, classification: "EXTRACTED_EXACT" }).text);
  }
  return bits.length ? bits.join(" · ") : null;
}

export default function LivingBenefitRiderCards({ cards = [] }) {
  if (!cards.length) {
    return (
      <p className="pi-report__empty" data-testid="pi-riders-empty">
        Living-benefit rider details were not captured for this illustration.
      </p>
    );
  }

  return (
    <div className="pi-rider-grid" data-testid="pi-rider-grid">
      {cards.map((card) => {
        const payout = formatClassifiedValue(card.exactPayout);
        const pages = collectPages(card.provenance, card.sourcePages, card.sourcePage);
        const formSource = formatSourceLine({
          form: card.form,
          pages
        });
        const classSource = formatSourceLine({
          classification: card.carrierCalculationRequired
            ? VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
            : payout.classification,
          pages
        });
        const limits = limitLine(card.limits);
        const form = card.form || (card.formNumbers || []).join(", ") || null;
        const carrierText =
          card.carrierCalculationRequiredText || DEFAULT_CARRIER_TEXT;

        return (
          <article
            key={`${card.form || card.type}-${card.rider}`}
            className="pi-rider-card"
            data-testid={`pi-rider-card-${card.form || card.type}`}
            data-form={card.form || ""}
          >
            <h3 className="pi-rider-card__name">{card.rider || card.type}</h3>
            {form ? <p className="pi-rider-card__form">Form {form}</p> : null}
            {card.whatQualifies ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">What qualifies</span>
                {String(card.whatQualifies).replace(/_/g, " ")}
              </p>
            ) : null}
            {limits ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Benefit limits</span>
                {limits}
              </p>
            ) : null}
            {chargeText(card.riderCharges) || chargeText(card.administrativeFees) ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Rider / admin charges</span>
                {chargeText(card.riderCharges) || chargeText(card.administrativeFees)}
              </p>
            ) : null}
            {card.discountMethodology ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Discount methodology</span>
                {String(card.discountMethodology).replace(/_/g, " ")}
                {card.discountSampleInterestRate != null ? (
                  <span className="pi-rider-card__illustrative">
                    {" "}
                    Sample {Number(card.discountSampleInterestRate) * 100}% is illustrative only.
                  </span>
                ) : null}
              </p>
            ) : null}

            {card.carrierCalculationRequired || !card.exactPayoutCalculable ? (
              <p
                className="pi-rider-card__carrier"
                data-testid="pi-rider-carrier-calc"
              >
                {carrierText}
              </p>
            ) : (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Actual benefit</span>
                {payout.text}
              </p>
            )}

            {card.cashReceivedNotEqualToAmountAccelerated ? (
              <p className="pi-rider-card__warning" data-testid="pi-cash-not-accelerated-db">
                Cash received is not the same as the death benefit accelerated. The remaining death
                benefit may be reduced by a larger amount than the cash actually paid when the
                policy terms provide for a discount.
              </p>
            ) : null}

            {card.remainingDeathBenefitEffect ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Remaining death benefit</span>
                {String(card.remainingDeathBenefitEffect).replace(/_/g, " ")}
              </p>
            ) : null}
            {card.accountValueEffect ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Effect on accumulated value</span>
                {String(card.accountValueEffect).replace(/_/g, " ")}
              </p>
            ) : null}
            {card.cashSurrenderValueEffect ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Effect on cash surrender value</span>
                {String(card.cashSurrenderValueEffect).replace(/_/g, " ")}
              </p>
            ) : null}
            {card.loanDebtEffect ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Loans / debt</span>
                {String(card.loanDebtEffect).replace(/_/g, " ")}
              </p>
            ) : null}
            {card.taxMedicaidCaveats ? (
              <p className="pi-rider-card__body">
                <span className="pi-rider-card__kicker">Tax / Medicaid</span>
                {card.taxMedicaidCaveats}
              </p>
            ) : null}
            {formSource ? (
              <p className="pi-source-line" data-testid="pi-rider-source">
                {formSource}
              </p>
            ) : null}
            {classSource && classSource !== formSource ? (
              <p className="pi-source-line" data-testid="pi-rider-source-method">
                {classSource}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
