/**
 * Milestone 4 — Recruiter Brief presentation (frontend only).
 * Backend recruiterBrief items are shown as-is — with a final safety filter.
 */

const MISSION_HERO_ICONS = {
  ScheduleInterview: "🎯",
  EnterInterviewOutcome: "✅"
};

const BLOCKED_LINE_PATTERNS = [
  /^lead:/i,
  /^prospect from /i,
  /next field:/i,
  /^remaining:/i,
  /\bdaypart\b/i,
  /capturestate/i,
  /^interview not scheduled$/i,
  /^interview confirmed$/i,
  /^ready for agent handoff$/i,
  /^new prospect in queue$/i
];

function isBlockedBriefLine(line) {
  const value = String(line || "").trim();
  return !value || BLOCKED_LINE_PATTERNS.some((pattern) => pattern.test(value));
}

export function buildRecruiterBriefBullets(lines = []) {
  const seen = new Set();

  return (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || "").trim())
    .filter((line) => {
      if (!line || isBlockedBriefLine(line)) {
        return false;
      }

      const key = line.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

/** @deprecated Use buildRecruiterBriefBullets — kept for existing imports. */
export function buildAtlasBriefBullets(lines = [], _mission = null, _translate = null) {
  return buildRecruiterBriefBullets(lines);
}

export function getMissionHeroIcon(missionType) {
  return MISSION_HERO_ICONS[missionType] || "🎯";
}

export function buildExecutiveRecommendation(mission, translate) {
  if (!mission) {
    return "";
  }

  if (mission.missionType === "ScheduleInterview") {
    return translate("executiveRecommendationScheduleInterview");
  }

  if (mission.missionType === "EnterInterviewOutcome") {
    return translate("executiveRecommendationInterviewOutcome");
  }

  if (mission.reason) {
    return translate("executiveRecommendationFallback", { reason: mission.reason });
  }

  return translate("executiveRecommendationDefault");
}
