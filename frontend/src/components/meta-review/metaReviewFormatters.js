/**
 * Shared formatters for Meta Review Workspace presentation.
 */

export function formatMetaReviewConnectionStatus(connected) {
  return connected ? "🟢 Connected" : "⚪ Not Connected";
}

export function formatMetaReviewServiceStatus(active) {
  return active ? "🟢 Connected" : "⚪ Not Connected";
}

export function formatMetaReviewSyncTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfTarget) / 86_400_000);

  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  if (diffDays === 0) {
    return `Today at ${time}`;
  }

  if (diffDays === 1) {
    return `Yesterday at ${time}`;
  }

  const datePart = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {})
  });

  return `${datePart} at ${time}`;
}

export function formatMetaReviewVersionLabel(version) {
  return `Atlas AI v${version}`;
}
