/**
 * Pure helpers for IUL Policy Review Workflow Simulator UI.
 */

export function summarizeIulScenarioReport(report) {
  if (!report || typeof report !== "object") {
    return {
      scenarioId: null,
      scenarioName: null,
      pass: false,
      mode: "dry_run",
      turnCount: 0
    };
  }

  const turns = Array.isArray(report.turns) ? report.turns : [];
  const summary = report.summary || {};

  return {
    scenarioId: report.scenarioId || null,
    scenarioName: report.scenarioName || report.scenarioId || null,
    pass: Boolean(report.pass),
    mode: report.mode || "dry_run",
    turnCount: turns.length,
    passed: Number(summary.passed ?? turns.filter((t) => t.pass).length) || 0,
    failed: Number(summary.failed ?? turns.filter((t) => !t.pass).length) || 0
  };
}

export function formatIulDiagnosticsRows(diagnostics = {}) {
  return [
    ["intent", diagnostics.intent],
    ["reasonCodes", (diagnostics.reasonCodes || []).join(", ") || "—"],
    ["lastQuestionAsked", diagnostics.lastQuestionAsked],
    ["iulWorkflowStage", diagnostics.iulWorkflowStage],
    ["iulQualificationStatus", diagnostics.iulQualificationStatus],
    ["iulReviewIntent", diagnostics.iulReviewIntent],
    ["meetingMode", diagnostics.meetingMode],
    ["selectedDate", diagnostics.selectedDate],
    ["selectedDaypart", diagnostics.selectedDaypart],
    ["offeredDays", (diagnostics.offeredDays || []).join(", ") || "—"],
    ["offeredSlots", (diagnostics.offeredSlots || []).join(", ") || "—"],
    ["appointmentStatus", diagnostics.appointmentStatus],
    ["bookingPending", diagnostics.bookingPending],
    ["mayCreateAppointment", diagnostics.mayCreateAppointment]
  ];
}

export function summarizeIulStagingReport(report) {
  const staging = report?.staging || {};
  return {
    calendarName: staging.calendarName || "—",
    meetingMode: staging.meetingMode || "—",
    eventCreated: Boolean(staging.event?.created),
    eventId: staging.event?.eventId || null,
    zoomVerified: staging.zoom?.verified,
    zoomConfigured: staging.zoom?.configured,
    cleanupStatus: staging.cleanup?.status || "pending",
    simulatorRunId: report?.simulatorRunId || null
  };
}
