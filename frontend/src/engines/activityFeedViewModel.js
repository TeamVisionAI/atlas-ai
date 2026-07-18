/**
 * Sprint 10.2b — Activity feed presentation (grouping, filters, labels).
 */

const FILTER_GROUPS = Object.freeze({
  all: null,
  messages: ["message_inbound", "message_outbound"],
  notes: ["note"],
  workflow: ["workflow_event", "reminder", "system"]
});

function startOfLocalDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getActivityTimeGroup(timestamp, now = new Date()) {
  const value = new Date(timestamp);
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  if (value >= todayStart) {
    return "today";
  }

  if (value >= yesterdayStart) {
    return "yesterday";
  }

  if (value >= weekStart) {
    return "thisWeek";
  }

  return "earlier";
}

const GROUP_ORDER = ["today", "yesterday", "thisWeek", "earlier"];

const GROUP_LABEL_KEYS = {
  today: "workspaceActivityGroupToday",
  yesterday: "workspaceActivityGroupYesterday",
  thisWeek: "workspaceActivityGroupThisWeek",
  earlier: "workspaceActivityGroupEarlier"
};

export function getActivityFilterOptions(translate) {
  return [
    { id: "all", label: translate("workspaceActivityFilterAll") },
    { id: "messages", label: translate("workspaceActivityFilterMessages") },
    { id: "notes", label: translate("workspaceActivityFilterNotes") },
    { id: "workflow", label: translate("workspaceActivityFilterWorkflow") }
  ];
}

export function filterActivityItems(items, filterId) {
  const types = FILTER_GROUPS[filterId];

  if (!types) {
    return items;
  }

  return items.filter((item) => types.includes(item.activityType));
}

export function groupActivityItems(items, translate, now = new Date()) {
  const buckets = new Map(GROUP_ORDER.map((key) => [key, []]));

  for (const item of items) {
    const group = getActivityTimeGroup(item.timestamp, now);
    buckets.get(group).push(item);
  }

  return GROUP_ORDER.filter((key) => buckets.get(key).length)
    .map((key) => ({
      id: key,
      label: translate(GROUP_LABEL_KEYS[key]),
      items: buckets.get(key)
    }));
}

export function buildActivityItemLabel(item, translate) {
  switch (item.activityType) {
    case "message_inbound":
      return translate("workspaceActivityTypeMessageInbound");
    case "message_outbound":
      return translate("workspaceActivityTypeMessageOutbound");
    case "note":
      return translate("workspaceActivityTypeNote");
    case "reminder":
      return translate("workspaceActivityTypeReminder");
    case "system":
      return translate("workspaceActivityTypeSystem");
    case "workflow_event":
    default:
      return translate("workspaceActivityTypeWorkflow", {
        eventType: item.eventType || "Event"
      });
  }
}

export function buildActivityItemBody(item) {
  const preview = item.payload?.bodyPreview || item.payload?.noteText;

  if (preview) {
    return preview;
  }

  if (item.payload?.milestoneAfter) {
    return item.payload.milestoneAfter;
  }

  return null;
}

export function buildActivityActorLabel(item, translate) {
  switch (item.actor) {
    case "prospect":
      return translate("workspaceActivityActorProspect");
    case "AGENT":
      return translate("workspaceActivityActorAgent");
    case "ATLAS":
      return translate("workspaceActivityActorAtlas");
    default:
      return item.actor || translate("workspaceActivityActorSystem");
  }
}

export function formatActivityTimestamp(timestamp, locale) {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function getActivityTypesQuery(filterId) {
  const types = FILTER_GROUPS[filterId];
  return types ? types.join(",") : null;
}
