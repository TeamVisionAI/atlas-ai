/**
 * Sprint 12.5.2 — Follow-ups queue presentation helpers.
 */

export const FOLLOW_UP_FILTERS = Object.freeze({
  ALL: "all",
  NEEDS_DATE: "needs-date",
  DUE_TODAY: "due-today",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  COMPLETED: "completed"
});

export const FOLLOW_UP_SORT_OPTIONS = Object.freeze({
  DUE_DATE: "due-date",
  PRIORITY: "priority",
  NAME: "name"
});

const STATUS_LABEL_KEYS = Object.freeze({
  "needs-date": "followUpsStatusNeedsDate",
  "due-today": "followUpsStatusDueToday",
  overdue: "followUpsStatusOverdue",
  upcoming: "followUpsStatusUpcoming",
  completed: "followUpsStatusCompleted"
});

const FILTER_LABEL_KEYS = Object.freeze({
  all: "followUpsFilterAll",
  "needs-date": "followUpsFilterNeedsDate",
  "due-today": "followUpsFilterDueToday",
  overdue: "followUpsFilterOverdue",
  upcoming: "followUpsFilterUpcoming",
  completed: "followUpsFilterCompleted"
});

export function getFollowUpFilterOptions(filters = [], translate) {
  const countById = new Map(filters.map((row) => [row.id, row.count || 0]));

  return Object.values(FOLLOW_UP_FILTERS).map((id) => ({
    id,
    label: translate(FILTER_LABEL_KEYS[id] || id),
    count: countById.get(id) ?? 0
  }));
}

export function getFollowUpSortOptions(translate) {
  return [
    { id: FOLLOW_UP_SORT_OPTIONS.DUE_DATE, label: translate("followUpsSortDueDate") },
    { id: FOLLOW_UP_SORT_OPTIONS.PRIORITY, label: translate("followUpsSortPriority") },
    { id: FOLLOW_UP_SORT_OPTIONS.NAME, label: translate("followUpsSortName") }
  ];
}

export function buildFollowUpStatusLabel(item, translate) {
  return translate(STATUS_LABEL_KEYS[item?.status] || "followUpsStatusUpcoming");
}

export function buildFollowUpReasonLabel(item, translate) {
  if (!item?.followUpReason) {
    return translate("followUpsReasonUnknown");
  }

  const key = `followUpsReason_${item.followUpReason.replace(/\s+/g, "_")}`;
  const translated = translate(key);

  return translated === key ? item.followUpReason : translated;
}

export function buildFollowUpDueDate(followUpDate, followUpTime, locale) {
  if (!followUpDate) {
    return null;
  }

  const hasTime = Boolean(followUpTime);
  const parsed = Date.parse(`${followUpDate}T${hasTime ? followUpTime : "12:00"}`);

  if (Number.isNaN(parsed)) {
    return followUpDate;
  }

  return new Date(parsed).toLocaleString(locale, hasTime
    ? {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }
    : {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
}

export function buildFollowUpPriorityLabel(item, translate) {
  if (item?.status === "needs-date") {
    return translate("followUpsPriorityNeedsDate");
  }

  if (item?.status === "overdue") {
    return translate("followUpsPriorityOverdue");
  }

  if (item?.status === "due-today") {
    return translate("followUpsPriorityDueToday");
  }

  if (item?.missionControlPriorityTier === "FOLLOW_UP_DUE") {
    return translate("followUpsPriorityHigh");
  }

  return translate("followUpsPriorityStandard");
}

export function buildFollowUpsSummary(payload, translate) {
  if (!payload) {
    return "";
  }

  return translate("followUpsSummary", {
    shown: payload.filteredCount || 0,
    total: payload.totalCount || 0
  });
}

export function buildFollowUpRepresentativeLabel(item, translate) {
  if (item?.representativeName) {
    return item.representativeName;
  }

  return translate("followUpsRepresentativeUnassigned");
}
