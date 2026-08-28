/**
 * ATLAS_SHARED_SCHEDULING_V2 — nearest-alternative slot offering.
 * When requested window has zero qualifying slots, offer 2–3 real nearby options.
 */

"use strict";

function timeKeyToMinutes(timeKey) {
  if (timeKey == null || timeKey === "") {
    return null;
  }
  const raw = String(timeKey).trim();
  if (!raw.includes(":")) {
    return null;
  }
  const [h, m] = raw.split(":").map((part) => Number(part));
  if (!Number.isFinite(h)) {
    return null;
  }
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function daysBetweenDateKeys(startKey, endKey) {
  const [ys, ms, ds] = String(startKey).split("-").map(Number);
  const [ye, me, de] = String(endKey).split("-").map(Number);
  const a = Date.UTC(ys, ms - 1, ds, 12);
  const b = Date.UTC(ye, me - 1, de, 12);
  return Math.round((b - a) / 86400000);
}

function slotIdentity(slot) {
  return `${slot?.dateKey || slot?.date || ""}|${slot?.timeKey || slot?.time || ""}`;
}

function sortSlotsChronologically(slots) {
  return [...(slots || [])].sort((a, b) => {
    const dateCmp = String(a.dateKey || a.date || "").localeCompare(
      String(b.dateKey || b.date || "")
    );
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return (
      (timeKeyToMinutes(a.timeKey || a.time) || 0) -
      (timeKeyToMinutes(b.timeKey || b.time) || 0)
    );
  });
}

function selectCrossDateCandidateSlots(slots, { maxCandidates = 3 } = {}) {
  const ordered = sortSlotsChronologically(slots);
  if (!ordered.length) {
    return [];
  }
  if (maxCandidates < 2 || ordered.length === 1) {
    return [ordered[0]];
  }
  const first = ordered[0];
  const firstDate = String(first.dateKey || first.date || "");
  const sameDay = ordered.filter(
    (slot) => String(slot.dateKey || slot.date || "") === firstDate
  );
  if (sameDay.length >= 2) {
    const last = sameDay[sameDay.length - 1];
    if (slotIdentity(first) === slotIdentity(last)) {
      return [first];
    }
    return [first, last].slice(0, maxCandidates);
  }
  const otherDate = ordered.find(
    (slot) => String(slot.dateKey || slot.date || "") !== firstDate
  );
  if (otherDate) {
    return [first, otherDate].slice(0, maxCandidates);
  }
  const last = ordered[ordered.length - 1];
  if (slotIdentity(first) === slotIdentity(last)) {
    return [first];
  }
  return [first, last].slice(0, maxCandidates);
}

/**
 * Score unconstrained real slots by distance from requested constraints.
 * Priority: same day nearest time → same day-part nearby date → next closest.
 */
function findNearestAlternativeSlots(
  allFutureSlots,
  constraints = {},
  requestedDate = null,
  options = {}
) {
  const maxCandidates = options.maxCandidates || 3;
  const pool = sortSlotsChronologically(allFutureSlots || []);
  if (!pool.length) {
    return [];
  }

  const targetDate = requestedDate || null;
  const earliest = timeKeyToMinutes(constraints.earliestTime);
  const latest = timeKeyToMinutes(constraints.latestTime);
  const dayPart = String(constraints.dayPart || "").toLowerCase();

  const earliestInclusive =
    typeof constraints.earliestTimeInclusive === "boolean"
      ? constraints.earliestTimeInclusive
      : true;

  const scored = pool.map((slot) => {
    const slotDate = slot.dateKey || slot.date || null;
    const slotMinutes = timeKeyToMinutes(slot.timeKey || slot.time);
    let score = 0;

    if (targetDate) {
      const dayDelta = Math.abs(daysBetweenDateKeys(targetDate, slotDate));
      score += dayDelta * 24 * 60;
      if (dayDelta === 0) {
        score -= 100000;
      }
    }

    if (earliest != null && slotMinutes != null) {
      if (earliestInclusive) {
        if (slotMinutes < earliest) {
          score += (earliest - slotMinutes) + 500;
        } else {
          score += slotMinutes - earliest;
        }
      } else if (slotMinutes <= earliest) {
        // "After 5pm" miss → prefer closest valid slot BEFORE the bound on same day.
        const belowBy = earliest - slotMinutes;
        score += belowBy + 100;
        if (belowBy === 0) {
          score += 250;
        }
      } else {
        score += slotMinutes - earliest;
      }
    } else if (latest != null && slotMinutes != null) {
      if (slotMinutes > latest) {
        score += slotMinutes - latest + 500;
      } else {
        score += latest - slotMinutes;
      }
    }

    if (dayPart && slotMinutes != null && !earliest && !latest) {
      if (dayPart === "morning" && slotMinutes >= 12 * 60) {
        score += 300;
      }
      if (dayPart === "afternoon" && slotMinutes <= 12 * 60) {
        score += 300;
      }
      if (dayPart === "evening" && slotMinutes < 17 * 60) {
        score += 300;
      }
    }

    return { slot, score };
  });

  scored.sort((a, b) => a.score - b.score);
  const seen = new Set();
  const picked = [];
  for (const entry of scored) {
    const id = slotIdentity(entry.slot);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    picked.push(entry.slot);
    if (picked.length >= maxCandidates) {
      break;
    }
  }
  return picked;
}

function enrichReadResultWithNearestAlternatives(
  readResult,
  { constraints = {}, requestedDate = null, maxCandidates = 3 } = {}
) {
  if (!readResult) {
    return readResult;
  }
  if (Array.isArray(readResult.offeredSlots) && readResult.offeredSlots.length > 0) {
    return readResult;
  }

  const pool =
    readResult.unconstrainedFutureSlots ||
    readResult.allFutureSlots ||
    [];
  if (!pool.length) {
    return readResult;
  }

  const nearest = findNearestAlternativeSlots(
    pool,
    constraints,
    requestedDate || readResult.date || null,
    { maxCandidates }
  );
  if (!nearest.length) {
    return readResult;
  }

  const offered = selectCrossDateCandidateSlots(nearest, { maxCandidates });
  return {
    ...readResult,
    status: "available",
    offeredSlots: offered,
    nearestAlternativesSource: "constraint_miss",
    alternativeToConstraint: true
  };
}

function mapSlotsForDecision(slots, timezone) {
  return (slots || []).map((slot) => ({
    date: slot.date || slot.dateKey,
    time: slot.time || slot.timeKey,
    timezone: slot.timezone || timezone || null
  }));
}

module.exports = {
  findNearestAlternativeSlots,
  enrichReadResultWithNearestAlternatives,
  selectCrossDateCandidateSlots,
  mapSlotsForDecision,
  sortSlotsChronologically,
  slotIdentity
};
