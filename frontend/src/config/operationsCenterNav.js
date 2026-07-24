import { appPath } from "./appRoutes";

export const operationsCenterSections = [
  { id: "system-health", labelKey: "opsNavSystemHealth" },
  { id: "workflow-simulator", labelKey: "opsNavWorkflowSimulator" },
  { id: "business-events", labelKey: "opsNavBusinessEvents" },
  { id: "projection-replay", labelKey: "opsNavProjectionReplay" },
  { id: "timeline-inspector", labelKey: "opsNavTimelineInspector" },
  { id: "smoke-tests", labelKey: "opsNavSmokeTests" },
  { id: "logs", labelKey: "opsNavLogsDiagnostics" }
];

export function operationsCenterPath(section = "system-health") {
  return appPath(`operations-center/${section}`);
}
