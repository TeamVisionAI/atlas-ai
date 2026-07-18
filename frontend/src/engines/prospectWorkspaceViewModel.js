/**
 * Sprint 10.2a — Prospect Workspace presentation summaries.
 * One-line accordion summaries for leader scanning (UX rule).
 */

import { formatInterviewDateTime } from "../adapters/prospectWorkspaceAdapter";

const JOURNEY_STEP_KEYS = {
  lead: "workspaceJourneyLead",
  qualify: "workspaceJourneyQualify",
  interview: "workspaceJourneyInterview",
  outcome: "workspaceJourneyOutcome",
  recruit: "workspaceJourneyRecruit",
  orientation: "workspaceJourneyOrientation"
};

export function getJourneyStepLabelKey(stepKey) {
  return JOURNEY_STEP_KEYS[stepKey] || stepKey;
}

export function buildInterviewAccordionSummary(interview, translate) {
  if (!interview?.datetime) {
    return translate("workspaceInterviewSummaryNone");
  }

  const when = formatInterviewDateTime(interview.datetime);
  const type = interview.type || translate("workspaceInterviewSummaryTypeUnknown");

  if (interview.gateActive) {
    return translate("workspaceInterviewSummaryGate", { when, type });
  }

  if (interview.outcome) {
    return translate("workspaceInterviewSummaryOutcome", {
      when,
      type,
      outcome: interview.outcome
    });
  }

  if (interview.isPast) {
    return translate("workspaceInterviewSummaryPast", { when, type });
  }

  return translate("workspaceInterviewSummaryUpcoming", { when, type });
}

export function buildStatusAccordionSummary(status, translate) {
  const parts = [
    status?.milestone || translate("workspaceStatusSummaryUnknown")
  ];

  if (status?.workflowOwnership) {
    parts.push(status.workflowOwnership);
  }

  if (status?.priorityTier) {
    parts.push(
      translate("workspaceStatusSummaryPriority", {
        tier: status.priorityTier.replace(/_/g, " ")
      })
    );
  }

  if (status?.stalledAt) {
    parts.push(translate("workspaceStatusSummaryStalled"));
  }

  return parts.join(" · ");
}

export function buildCaptureAccordionSummary(capture, owner, translate) {
  const parts = [];

  if (capture?.communicationLanguage) {
    parts.push(
      capture.communicationLanguage === "es"
        ? translate("quickCaptureLanguageEs")
        : translate("quickCaptureLanguageEn")
    );
  }

  if (capture?.source) {
    parts.push(capture.source.replace(/_/g, " "));
  }

  if (owner?.display_name) {
    parts.push(owner.display_name);
  } else if (capture?.entryMethod) {
    parts.push(capture.entryMethod.replace(/_/g, " "));
  }

  if (!parts.length) {
    return translate("workspaceCaptureSummaryEmpty");
  }

  return parts.join(" · ");
}

export function buildCoachAccordionSummary(translate) {
  return translate("workspaceCoachSummary");
}

export function buildPrimaryActionSummary(actions, translate) {
  if (!actions?.length) {
    return translate("workspaceActionsSummaryEmpty");
  }

  return actions[0]?.title || translate("workspaceActionsSummaryEmpty");
}

export function buildActivityFeedPlaceholderSummary(translate) {
  return translate("workspaceActivitySummaryPending");
}
