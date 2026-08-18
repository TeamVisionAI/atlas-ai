import {
  formatClassifiedValue
} from "./classifiedValueDisplay";
import { collectPages, formatSourceLine } from "./sourceReferences";

function CostCard({ category }) {
  const formatted = formatClassifiedValue(category?.display);
  const source = formatSourceLine({
    classification: formatted.classification,
    pages: collectPages(category.sourcePages, category.provenance, category.display),
    tableLabel: "Policy Illustration"
  });
  const schedule =
    category?.id === "surrender_charges" && category.scheduleLength > 0
      ? `${category.scheduleLength}-year schedule sourced`
      : null;

  return (
    <article
      className={`pi-cost-card pi-cost-card--${String(formatted.classification || "NOT_AVAILABLE").toLowerCase()}`}
      data-testid={`pi-cost-card-${category.id}`}
      data-classification={formatted.classification}
    >
      <p className="pi-cost-card__number">{category.number}</p>
      <h3 className="pi-cost-card__label">{category.label}</h3>
      <p className="pi-cost-card__value" data-testid={`pi-cost-value-${category.id}`}>
        {formatted.text}
      </p>
      {formatted.caption ? (
        <p className="pi-cost-card__caption">{formatted.caption}</p>
      ) : null}
      {category.existenceMentioned && formatted.value == null ? (
        <p className="pi-cost-card__note">Named in the illustration without a disclosed dollar amount.</p>
      ) : null}
      {category.notes && formatted.value == null ? (
        <p className="pi-cost-card__note">{String(category.notes).replace(/_/g, " ")}</p>
      ) : null}
      {schedule ? <p className="pi-cost-card__note">{schedule}</p> : null}
      {category.separateFromCsv ? (
        <p className="pi-cost-card__note">Surrender charge is separate from cash surrender value.</p>
      ) : null}
      {source ? (
        <p className="pi-source-line" data-testid={`pi-cost-source-${category.id}`}>
          {source}
        </p>
      ) : null}
    </article>
  );
}

export default function PolicyCostCategoryCards({ categories = [] }) {
  if (!categories.length) {
    return (
      <p className="pi-report__empty" data-testid="pi-costs-incomplete">
        Policy cost details are not available for this illustration.
      </p>
    );
  }

  return (
    <div className="pi-cost-grid" data-testid="pi-cost-grid">
      {categories.map((category) => (
        <CostCard key={category.id} category={category} />
      ))}
    </div>
  );
}
