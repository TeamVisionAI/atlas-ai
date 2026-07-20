/**
 * Sprint 10.3 — Prospect Center presentation view model.
 * Maps server DTOs to localized labels — no business rules.
 */

import { EXECUTIVE_FILTER_LABEL_KEYS } from "./executiveFilterEngine";

const MILESTONE_LABEL_KEYS = {
  NEW_LEAD: "prospectCenterMilestoneNewLead",
  GREETING_SENT: "prospectCenterMilestoneGreetingSent",
  QUALIFICATION: "prospectCenterMilestoneQualification",
  INTERVIEW_READY: "prospectCenterMilestoneInterviewReady",
  INTERVIEW_SCHEDULED: "prospectCenterMilestoneInterviewScheduled",
  INTERVIEW_DUE: "prospectCenterMilestoneInterviewDue",
  INTERVIEW_COMPLETED: "prospectCenterMilestoneInterviewCompleted",
  INTERVIEW_RESULT_PENDING: "prospectCenterMilestoneInterviewResultPending",
  FOLLOW_UP: "prospectCenterMilestoneFollowUp",
  ORIENTATION: "prospectCenterMilestoneOrientation",
  LICENSING: "prospectCenterMilestoneLicensing",
  FAST_START: "prospectCenterMilestoneFastStart",
  CLOSED: "prospectCenterMilestoneClosed",
  DO_NOT_CONTACT: "prospectCenterMilestoneDoNotContact"
};

const FILTER_LABEL_KEYS = {
  all: "prospectCenterFilterAll",
  ...EXECUTIVE_FILTER_LABEL_KEYS
};

export function getProspectCenterFilterOptions(filters = [], translate) {
  return filters.map((entry) => ({
    id: entry.id,
    count: entry.count,
    label: translate(FILTER_LABEL_KEYS[entry.id] || entry.id)
  }));
}

export function buildProspectMilestoneLabel(item, translate) {
  const key = MILESTONE_LABEL_KEYS[item.canonicalMilestone];

  if (key) {
    return translate(key);
  }

  return item.canonicalMilestone || translate("prospectCenterMilestoneUnknown");
}

export function buildProspectPriorityLabel(item, translate) {
  if (item.missionControlPriority <= 1) {
    return translate("executivePriorityHigh");
  }

  if (item.missionControlPriority <= 2) {
    return translate("executivePriorityMedium");
  }

  return translate("executivePriorityLow");
}

export function buildProspectLocationLabel(item) {
  if (item.city && item.state) {
    return `${item.city}, ${item.state}`;
  }

  return item.city || item.state || null;
}

export function formatProspectInterviewWhen(timestamp, locale) {
  if (!timestamp) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function buildProspectCenterSummary(payload, translate) {
  if (!payload) {
    return "";
  }

  if (payload.search) {
    return translate("prospectCenterSummarySearch", {
      count: payload.filteredCount,
      total: payload.totalCount,
      query: payload.search
    });
  }

  if (payload.activeFilter && payload.activeFilter !== "all") {
    const filterLabel = translate(
      FILTER_LABEL_KEYS[payload.activeFilter] || payload.activeFilter
    );

    return translate("prospectCenterSummaryFilter", {
      count: payload.filteredCount,
      total: payload.totalCount,
      filter: filterLabel
    });
  }

  return translate("prospectCenterSummaryAll", {
    count: payload.totalCount
  });
}
