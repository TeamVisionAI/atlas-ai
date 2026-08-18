/**
 * Presentation grouping for rider cards. Does not change economics.
 * Matches BR-144 living-benefit vs other rider identity already stored on the DTO.
 */

export const ACCELERATED_PRINT_PAIRS = {
  TERMINAL_CHRONIC: "terminal-chronic",
  CRITICAL_ILLNESS_INJURY: "critical-illness-injury"
};

function riderLabel(card = {}) {
  return `${card.rider || ""} ${card.type || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isAcceleratedLivingBenefitRider(card = {}) {
  if (card.riderCategory === "living_benefit") {
    return true;
  }
  if (card.riderCategory === "other") {
    return false;
  }
  return /illness|injury|living benefit|accelerated|\babr\b/i.test(
    `${card.type || ""} ${card.rider || ""}`
  );
}

export function acceleratedPrintPairId(card = {}) {
  const text = riderLabel(card);
  if (/\bterminal\b/.test(text)) {
    return ACCELERATED_PRINT_PAIRS.TERMINAL_CHRONIC;
  }
  if (/\bchronic\b/.test(text)) {
    return ACCELERATED_PRINT_PAIRS.TERMINAL_CHRONIC;
  }
  if (/\binjur/.test(text)) {
    return ACCELERATED_PRINT_PAIRS.CRITICAL_ILLNESS_INJURY;
  }
  if (/\bcritical\b/.test(text) && /\billness\b/.test(text)) {
    return ACCELERATED_PRINT_PAIRS.CRITICAL_ILLNESS_INJURY;
  }
  return null;
}

function pairSortKey(card) {
  const text = riderLabel(card);
  if (/\bterminal\b/.test(text) || (/\bcritical\b/.test(text) && /\billness\b/.test(text) && !/\binjur/.test(text))) {
    return 0;
  }
  return 1;
}

export function groupAcceleratedPrintPairs(cards = []) {
  const order = [
    ACCELERATED_PRINT_PAIRS.TERMINAL_CHRONIC,
    ACCELERATED_PRINT_PAIRS.CRITICAL_ILLNESS_INJURY
  ];
  const buckets = new Map(order.map((id) => [id, []]));
  const leftovers = [];

  for (const card of cards) {
    const id = acceleratedPrintPairId(card);
    if (id && buckets.has(id)) {
      buckets.get(id).push(card);
    } else {
      leftovers.push(card);
    }
  }

  const pairs = [];
  for (const id of order) {
    const group = [...buckets.get(id)].sort((left, right) => pairSortKey(left) - pairSortKey(right));
    for (let index = 0; index < group.length; index += 2) {
      pairs.push({ id, cards: group.slice(index, index + 2) });
    }
  }
  for (const card of leftovers) {
    pairs.push({ id: "living-other", cards: [card] });
  }
  return pairs;
}
