/**
 * Sprint 20 — Mission Control executive presentation (frontend only).
 * Transforms backend mission payloads into executive-facing copy.
 */

const MISSION_HERO_ICONS = {
  ScheduleInterview: "🎯",
  EnterInterviewOutcome: "✅"
};

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

export function buildAtlasBriefBullets(lines = [], mission, translate) {
  const bullets = [];
  const seen = new Set();

  function addBullet(text) {
    const normalized = String(text || "").trim();

    if (!normalized || seen.has(normalized.toLowerCase())) {
      return;
    }

    seen.add(normalized.toLowerCase());
    bullets.push(normalized);
  }

  if (mission?.workflowState?.label) {
    addBullet(
      translate("atlasBriefBulletWorkflowState", {
        state: mission.workflowState.label
      })
    );
  }

  for (const line of lines.slice(0, 3)) {
    addBullet(line);
  }

  if (mission?.title) {
    addBullet(translate("atlasBriefBulletRecommendation", { action: mission.title }));
  }

  return bullets.slice(0, 4);
}
