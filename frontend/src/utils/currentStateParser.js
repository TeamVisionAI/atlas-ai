/**
 * Parse structured sections from CURRENT_STATE.md for the Knowledge Hub dashboard.
 */

const SECTION_HEADINGS = [
  "Current Sprint",
  "Product Stage",
  "Overall Status",
  "Current Objective",
  "Working",
  "In Progress",
  "Blockers",
  "External Dependencies",
  "Next Actions",
  "Recent Decisions",
  "Recently Updated Documents",
  "Last Updated"
];

function stripMarkdownInline(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .trim();
}

export function parseCurrentStateSections(markdown) {
  if (!markdown || typeof markdown !== "string") {
    return {};
  }

  const sections = {};
  const headingPattern = /^##\s+(.+)$/gm;
  const matches = [...markdown.matchAll(headingPattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = match[1].trim();
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end).trim();

    sections[title] = body;
  }

  return sections;
}

export function getDashboardFields(sections) {
  const pick = (name) => {
    const raw = sections[name];

    if (!raw) {
      return "";
    }

    const firstLine = raw.split("\n").find((line) => line.trim()) || "";
    return stripMarkdownInline(firstLine);
  };

  return {
    currentSprint: pick("Current Sprint"),
    productStage: pick("Product Stage"),
    overallStatus: pick("Overall Status"),
    currentObjective: sections["Current Objective"]?.trim() || "",
    working: sections.Working?.trim() || "",
    inProgress: sections["In Progress"]?.trim() || "",
    blockers: sections.Blockers?.trim() || "",
    nextActions: sections["Next Actions"]?.trim() || "",
    recentDecisions: sections["Recent Decisions"]?.trim() || "",
    recentlyUpdated: sections["Recently Updated Documents"]?.trim() || "",
    lastUpdated: pick("Last Updated")
  };
}

export { SECTION_HEADINGS };
