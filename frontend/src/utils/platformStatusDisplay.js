/**
 * Sprint 17.0 — Pure helpers for Knowledge Hub platform status display.
 */

export function formatSprintLabel(sprint) {
  if (!sprint?.number) {
    return null;
  }

  const title = sprint.title ? ` — ${sprint.title}` : "";
  return `Sprint ${sprint.number}${title}`;
}

export function formatPlatformTitle(platform) {
  if (!platform?.name) {
    return "Atlas Core Platform";
  }

  const version = platform.version && platform.version !== "Unknown" ? ` v${platform.version}` : "";
  return `${platform.name}${version}`;
}

export function formatReleaseBadge(platform) {
  const release = platform?.releaseLabel;
  const certification = platform?.certification;

  if (!release || release === "Unknown") {
    return certification && certification !== "Unknown" ? certification.toUpperCase() : null;
  }

  if (!certification || certification === "Unknown") {
    return release.toUpperCase();
  }

  return `${release} ${certification}`.toUpperCase();
}

export function formatBannerDescription(platform, sprint) {
  const release = platform?.releaseLabel;
  const certification = platform?.certification;
  const phase = sprint?.phase;

  if (release && release !== "Unknown" && certification && certification !== "Unknown") {
    const phaseSuffix = phase ? ` The platform is now in ${phase}.` : "";
    return `Atlas Core has successfully completed ${release} certification (${certification}).${phaseSuffix}`;
  }

  if (phase) {
    return `Current phase: ${phase}.`;
  }

  return null;
}

const META_STATUS_LABELS = {
  in_review: "knowledgeHubMetaStatusInReview",
  not_submitted: "knowledgeHubMetaStatusNotSubmitted",
  approved: "knowledgeHubMetaStatusApproved",
  rejected: "knowledgeHubMetaStatusRejected"
};

export function formatMetaReviewStatus(status, t) {
  if (!status) {
    return t.knowledgeHubMetaStatusUnknown;
  }

  const key = META_STATUS_LABELS[status];
  return key ? t[key] : status.replace(/_/g, " ");
}

export function getFreshnessState({ generatedAt, cached, hasData, error }) {
  if (!hasData) {
    return "unknown";
  }

  if (error && cached) {
    return "cached";
  }

  if (!generatedAt) {
    return "unknown";
  }

  const ageMs = Date.now() - new Date(generatedAt).getTime();

  if (cached || ageMs > 120_000) {
    return "cached";
  }

  return "live";
}

export function formatGeneratedTimestamp(isoDate, locale) {
  if (!isoDate) {
    return null;
  }

  try {
    return new Date(isoDate).toLocaleString(locale);
  } catch {
    return isoDate;
  }
}
