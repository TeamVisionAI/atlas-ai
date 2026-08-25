import { formatClassifiedValue, VALUE_CLASSIFICATIONS } from "./classifiedValueDisplay";
import { collectPages, formatSourceLine } from "./sourceReferences";
import {
  groupAcceleratedPrintPairs,
  isAcceleratedLivingBenefitRider
} from "./riderPresentation";

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

function RiderCard({ card }) {
  const accelerated = isAcceleratedLivingBenefitRider(card);
  const payout = formatClassifiedValue(card.exactPayout);
  const pages = collectPages(card.provenance, card.sourcePages, card.sourcePage);
  const formSource = formatSourceLine({
    form: card.form,
    pages
  });
  const classSource = accelerated
    ? formatSourceLine({
      classification: card.carrierCalculationRequired
        ? VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
        : payout.classification,
      pages
    })
    : null;
  const limits = accelerated ? limitLine(card.limits) : null;
  const form = card.form || (card.formNumbers || []).join(", ") || null;
  const showCarrierCalc =
    accelerated && (card.carrierCalculationRequired || card.exactPayoutCalculable === false);
  const showCashDisclaimer = accelerated && card.cashReceivedNotEqualToAmountAccelerated === true;

  return (
    <article
      className={`pi-rider-card ${accelerated ? "pi-rider-card--living" : "pi-rider-card--feature"}`}
      data-testid={`pi-rider-card-${card.form || card.type}`}
      data-form={card.form || ""}
      data-rider-kind={accelerated ? "living-benefit" : "policy-feature"}
    >
      <header className="pi-rider-card__header">
        <span className="pi-rider-card__kicker">
          {accelerated ? "Accelerated living benefit" : "Policy feature"}
        </span>
        <h3 className="pi-rider-card__name">{card.rider || card.type}</h3>
        {form ? <p className="pi-rider-card__form">Form {form}</p> : null}
      </header>
      {card.whatQualifies ? (
        <p className="pi-rider-card__body">
          <span className="pi-rider-card__kicker">
            {accelerated ? "What qualifies" : "How it works"}
          </span>
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
      {accelerated && card.discountMethodology && !card.actuarialAdjustment?.applies ? (
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

      {accelerated && card.actuarialAdjustment?.applies ? (
        <p className="pi-rider-card__body" data-testid="pi-actuarial-adjustment">
          <span className="pi-rider-card__kicker">
            {card.actuarialAdjustment.displayLabel || "Actuarial Adjustment Factor"}
          </span>
          {card.actuarialAdjustment.uiNote || "Factor/formula not disclosed in policy."}
          {card.actuarialAdjustment.administrativeCharge != null ? (
            <span className="pi-rider-card__illustrative">
              {" "}
              Administrative charge $
              {Number(card.actuarialAdjustment.administrativeCharge).toLocaleString("en-US")}.
            </span>
          ) : null}
        </p>
      ) : null}

      {accelerated && !showCarrierCalc && card.exactPayoutCalculable ? (
        <p className="pi-rider-card__body">
          <span className="pi-rider-card__kicker">Actual benefit</span>
          {payout.text}
        </p>
      ) : null}

      {showCashDisclaimer ? (
        <p className="pi-rider-card__warning" data-testid="pi-cash-not-accelerated-db">
          Cash received is not the same as the death benefit accelerated. The remaining death
          benefit may be reduced by a larger amount than the cash actually paid when the
          policy terms provide for a discount.
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

      <div className="pi-rider-card__tail">
        {showCarrierCalc ? (
          <p className="pi-rider-card__carrier" data-testid="pi-rider-carrier-calc">
            {card.carrierCalculationRequiredText || DEFAULT_CARRIER_TEXT}
          </p>
        ) : null}
        {card.remainingDeathBenefitEffect ? (
          <p className="pi-rider-card__body">
            <span className="pi-rider-card__kicker">Remaining death benefit</span>
            {String(card.remainingDeathBenefitEffect).replace(/_/g, " ")}
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
      </div>
    </article>
  );
}

function riderCardKey(card) {
  return `${card.form || card.type}-${card.rider}`;
}

function LivingRiderGroup({ cards }) {
  if (!cards.length) {
    return null;
  }
  const pairs = groupAcceleratedPrintPairs(cards);
  return (
    <div className="pi-rider-group" data-testid="pi-rider-group-living">
      <h4 className="pi-rider-group__title">Accelerated living-benefit riders</h4>
      <div className="pi-rider-grid pi-rider-grid--living">
        {pairs.map((pair, index) => (
          <div
            key={`${pair.id}-${index}`}
            className="pi-rider-print-pair"
            data-testid={`pi-rider-print-pair-${pair.id}`}
            data-pair={pair.id}
            data-count={String(pair.cards.length)}
          >
            {pair.cards.map((card) => (
              <RiderCard key={riderCardKey(card)} card={card} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function OtherRiderGroup({ cards }) {
  if (!cards.length) {
    return null;
  }
  return (
    <div className="pi-rider-group" data-testid="pi-rider-group-other">
      <h4 className="pi-rider-group__title">Other policy riders / features</h4>
      <div className="pi-rider-grid pi-rider-grid--other">
        {cards.map((card) => (
          <RiderCard key={riderCardKey(card)} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function LivingBenefitRiderCards({ cards = [] }) {
  if (!cards.length) {
    return (
      <p className="pi-report__empty" data-testid="pi-riders-empty">
        Living-benefit rider details were not captured for this illustration.
      </p>
    );
  }

  const living = cards.filter((card) => isAcceleratedLivingBenefitRider(card));
  const other = cards.filter((card) => !isAcceleratedLivingBenefitRider(card));

  return (
    <div className="pi-rider-groups" data-testid="pi-rider-grid">
      <LivingRiderGroup cards={living} />
      <OtherRiderGroup cards={other} />
    </div>
  );
}
