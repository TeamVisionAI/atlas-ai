import { appPath } from "./appRoutes";

export const operationsCenterNavGroups = [
  {
    id: "monitoring",
    labelKey: "opsNavGroupMonitoring",
    items: [
      { id: "dashboard", labelKey: "opsNavDashboard", end: true },
      { id: "alpha-checklist", labelKey: "opsNavAlphaChecklist" },
      { id: "golden-path-trace", labelKey: "opsNavGoldenPathTrace" },
      { id: "system-health", labelKey: "opsNavSystemHealth" },
      { id: "live-activity", labelKey: "opsNavLiveActivity" },
      { id: "business-events", labelKey: "opsNavBusinessEvents" }
    ]
  },
  {
    id: "operations",
    labelKey: "opsNavGroupOperations",
    items: [
      { id: "workflow-simulator", labelKey: "opsNavWorkflowSimulator" },
      { id: "projection-replay", labelKey: "opsNavProjectionReplay" },
      { id: "timeline-inspector", labelKey: "opsNavTimelineInspector" }
    ]
  },
  {
    id: "diagnostics",
    labelKey: "opsNavGroupDiagnostics",
    items: [
      { id: "smoke-tests", labelKey: "opsNavSmokeTests" },
      { id: "logs", labelKey: "opsNavLogsDiagnostics" }
    ]
  }
];

export const operationsCenterSections = operationsCenterNavGroups.flatMap((group) => group.items);

export function operationsCenterPath(section = "dashboard") {
  if (section === "dashboard") {
    return appPath("operations-center");
  }

  return appPath(`operations-center/${section}`);
}
