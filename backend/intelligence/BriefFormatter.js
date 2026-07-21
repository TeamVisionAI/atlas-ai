/**
 * Release 1.3 — Daily Brief presentation formats (content unchanged).
 */

function formatAsJson(brief) {
  return JSON.parse(JSON.stringify(brief));
}

function formatSection(title, lines) {
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

function formatList(items, formatter) {
  if (!items?.length) {
    return ["- None"];
  }

  return items.map(formatter);
}

function formatAsMarkdown(brief) {
  const sections = [];

  sections.push(`# Atlas Daily Brief`);
  sections.push(`**Organization:** ${brief.organization}`);
  sections.push(`**Date:** ${brief.date}`);
  sections.push(`**Generated:** ${brief.generatedAt}`);
  sections.push("");

  sections.push(formatSection("Executive Summary", brief.executiveSummary?.lines || []));

  if (brief.executiveSummary?.recommendedAction) {
    sections.push(`**Recommended Action:** ${brief.executiveSummary.recommendedAction}`);
    sections.push("");
  }

  const health = brief.organizationHealth || {};
  sections.push(
    formatSection("Organization Health", [
      `Status: ${health.status}`,
      `Connector uptime: ${health.score}%`,
      `Active packages: ${health.activePackages}`,
      `Offices: ${health.offices}`,
      `Users: ${health.users}`
    ])
  );

  const metrics = brief.keyMetrics || {};
  sections.push(
    formatSection("Key Metrics", [
      `- New prospects today: ${metrics.newProspectsToday}`,
      `- Open conversations: ${metrics.openConversations}`,
      `- Interview rate: ${metrics.interviewRate}%`,
      `- No-show rate: ${metrics.noShowRate}%`,
      `- Join rate: ${metrics.joinRate}%`,
      `- Licensing rate: ${metrics.licensingRate}%`,
      `- Follow-up completion: ${metrics.followUpCompletion}%`
    ])
  );

  sections.push(
    formatSection(
      "Trends",
      formatList(brief.trends, (entry) =>
        `- ${entry.metric}: ${entry.current} (${entry.direction}${entry.previous !== null ? `, was ${entry.previous}` : ""})`
      )
    )
  );

  sections.push(
    formatSection(
      "Insights",
      formatList(brief.insights, (entry) => `- ${entry.observation}`)
    )
  );

  sections.push(
    formatSection(
      "Priorities",
      formatList(brief.priorities, (entry) => `- [${entry.level.toUpperCase()}] ${entry.title}: ${entry.reason}`)
    )
  );

  sections.push(
    formatSection(
      "Recommendations",
      formatList(
        brief.recommendations,
        (entry) =>
          `- [${entry.priority.toUpperCase()}] ${entry.suggestedAction} — ${entry.reason} (confidence: ${entry.confidence})`
      )
    )
  );

  const schedule = brief.todaySchedule || {};
  sections.push(
    formatSection(
      "Today's Schedule",
      [
        ...formatList(schedule.appointments, (entry) => `- Appointment: ${entry.prospectName} at ${entry.startTime}`),
        ...formatList(schedule.meetings, (entry) => `- Meeting: ${entry.prospectName} at ${entry.startTime}`)
      ]
    )
  );

  sections.push(
    formatSection(
      "Connector Status",
      formatList(brief.connectorStatus, (entry) => `- ${entry.id}: ${entry.health}`)
    )
  );

  sections.push(
    formatSection(
      "Package Status",
      formatList(
        brief.packageStatus,
        (entry) => `- ${entry.id}: ${entry.enabled ? "enabled" : "disabled"}${entry.configured ? " (configured)" : ""}`
      )
    )
  );

  return sections.join("\n");
}

/**
 * @param {Object} brief
 * @param {"json"|"markdown"} format
 */
function formatBrief(brief, format = "json") {
  switch (format) {
    case "markdown":
      return formatAsMarkdown(brief);
    case "json":
    default:
      return formatAsJson(brief);
  }
}

module.exports = {
  formatBrief,
  formatAsJson,
  formatAsMarkdown
};
