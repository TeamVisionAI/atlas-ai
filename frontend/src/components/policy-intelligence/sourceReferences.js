/**
 * Print-visible source references from BR-144 provenance.
 * Never invents page numbers. Multiple pages collapse to ranges.
 */

import { VALUE_CLASSIFICATIONS } from "./classifiedValueDisplay.js";

export function collectPages(...candidates) {
  const pages = new Set();

  function visit(value) {
    if (value == null || value === "") {
      return;
    }
    if (typeof value === "number" || typeof value === "string") {
      const page = Number(value);
      if (Number.isInteger(page) && page > 0) {
        pages.add(page);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      visit(value.sourcePage);
      visit(value.sourcePages);
      visit(value.pages);
      if (value.provenance) {
        visit(value.provenance);
      }
    }
  }

  candidates.forEach(visit);
  return [...pages].sort((a, b) => a - b);
}

export function formatPagePhrase(pages = []) {
  const list = collectPages(pages);
  if (!list.length) {
    return null;
  }

  const ranges = [];
  let start = list[0];
  let end = list[0];
  for (let i = 1; i < list.length; i += 1) {
    if (list[i] === end + 1) {
      end = list[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`);
      start = list[i];
      end = list[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`);
  const phrase = ranges.join(", ");
  const multi = list.length > 1 || ranges.some((item) => item.includes("–"));
  return `${multi ? "Pages" : "Page"} ${phrase}`;
}

export function formatSourceLine({
  classification = null,
  form = null,
  pages = [],
  tableLabel = "Policy Illustration"
} = {}) {
  const pagePhrase = formatPagePhrase(pages);
  const formLabel = form ? `Form ${form}` : null;

  if (classification === VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS && pagePhrase) {
    return `Calculated from policy terms — see ${pagePhrase}`;
  }
  if (classification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED && pagePhrase) {
    return `Carrier calculation required — methodology described on ${pagePhrase}`;
  }
  if (formLabel && pagePhrase) {
    return `Source: ${formLabel} — ${pagePhrase}`;
  }
  if (pagePhrase) {
    return `Source: ${tableLabel} — ${pagePhrase}`;
  }
  if (formLabel) {
    return `Source: ${formLabel}`;
  }
  return null;
}

function catalogKey(item) {
  return [item.kind, item.form || "", item.pages.join(","), item.label].join("|");
}

export function buildSourceCatalog(report = {}) {
  const items = [];
  const illustration = report.illustrationSource || {};
  const illustrationPages = collectPages(
    illustration.pages,
    (report.economics?.policyCostCheckpoints || []).map((row) => row.provenance)
  );
  if (illustrationPages.length) {
    items.push({
      kind: "annual_values",
      label: illustration.label || "Policy Illustration",
      form: null,
      pages: illustrationPages,
      text: `${illustration.label || "Policy Illustration"} — ${formatPagePhrase(illustrationPages)}`
    });
  }

  for (const category of report.economics?.policyCostCategories || []) {
    const pages = collectPages(category.sourcePages, category.provenance, category.display);
    if (!pages.length) {
      continue;
    }
    items.push({
      kind: "cost",
      label: category.label,
      form: null,
      pages,
      text: `${category.label} — ${formatPagePhrase(pages)}`
    });
  }

  for (const card of report.economics?.livingBenefitCards || []) {
    const pages = collectPages(card.provenance, card.sourcePages, card.sourcePage);
    const form = card.form || null;
    if (!pages.length && !form) {
      continue;
    }
    const pagePhrase = formatPagePhrase(pages);
    items.push({
      kind: "rider",
      label: card.rider || card.type || "Rider",
      form,
      pages,
      text: [card.rider || card.type, form ? `Form ${form}` : null, pagePhrase]
        .filter(Boolean)
        .join(" — ")
    });
  }

  const seen = new Set();
  return items
    .filter((item) => {
      const key = catalogKey(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((item, index) => ({ ...item, id: index + 1 }));
}

export function footnoteFor(catalog, predicate) {
  const match = (catalog || []).find(predicate);
  return match ? match.id : null;
}
