/**
 * Resolves interview outcome gate data for inline Mission Actions.
 * Falls back to recruiter-primary outcomes when API gate descriptor is incomplete.
 */

const FALLBACK_OUTCOME_CATEGORIES = [
  {
    id: "interview_outcome",
    label: "Interview Outcome",
    outcomes: [
      {
        id: "Recruited",
        label: "Recruited",
        fields: [
          { key: "orientationDate", type: "date", label: "Orientation Date" },
          { key: "orientationTime", type: "time", label: "Orientation Time" }
        ]
      },
      {
        id: "Needs More Time",
        label: "Needs More Time",
        fields: [
          { key: "followUpDate", type: "date", label: "Follow Up Date", defaultDays: 3 },
          { key: "followUpTime", type: "time", label: "Follow Up Time", defaultValue: "10:00" },
          { key: "notes", type: "textarea", label: "Notes" }
        ]
      },
      {
        id: "No Show",
        label: "No Show",
        fields: [
          { key: "followUpDate", type: "date", label: "Follow Up Date", defaultDays: 7 },
          { key: "followUpTime", type: "time", label: "Follow Up Time", defaultValue: "10:00" },
          { key: "notes", type: "textarea", label: "Notes" }
        ]
      },
      {
        id: "Not Interested",
        label: "Not Interested",
        fields: [
          { key: "notInterestedReason", type: "textarea", label: "Reason" },
          { key: "notes", type: "textarea", label: "Notes" }
        ]
      },
      {
        id: "Rescheduled",
        label: "Rescheduled",
        fields: [
          { key: "rescheduleDate", type: "date", label: "New Interview Date" },
          { key: "rescheduleTime", type: "time", label: "New Interview Time" },
          {
            key: "rescheduleInterviewType",
            type: "select",
            label: "Interview Type",
            options: ["Zoom", "Office"],
            defaultValue: "Zoom"
          },
          { key: "notes", type: "textarea", label: "Notes" }
        ]
      }
    ]
  }
];

function gateHasOutcomes(gate) {
  if (!gate) {
    return false;
  }

  if (Array.isArray(gate.outcomeCategories) && gate.outcomeCategories.length > 0) {
    return gate.outcomeCategories.some(
      (category) => Array.isArray(category.outcomes) && category.outcomes.length > 0
    );
  }

  return Array.isArray(gate.outcomes) && gate.outcomes.length > 0;
}

function normalizeGateShape(gate, translate) {
  if (!gate) {
    return null;
  }

  if (Array.isArray(gate.outcomeCategories) && gate.outcomeCategories.length > 0) {
    return {
      active: true,
      title: gate.title || translate("workflowGateTitle"),
      message: gate.message || translate("workflowGateMessage"),
      outcomeCategories: gate.outcomeCategories
    };
  }

  if (Array.isArray(gate.outcomes) && gate.outcomes.length > 0) {
    return {
      active: true,
      title: gate.title || translate("workflowGateTitle"),
      message: gate.message || translate("workflowGateMessage"),
      outcomeCategories: [
        {
          id: "default",
          label: "Outcomes",
          outcomes: gate.outcomes
        }
      ]
    };
  }

  return null;
}

export function buildFallbackInterviewOutcomeGate(translate) {
  return {
    active: true,
    title: translate("workflowGateTitle"),
    message: translate("workflowGateMessage"),
    outcomeCategories: FALLBACK_OUTCOME_CATEGORIES
  };
}

export function resolveInterviewOutcomeGate({ workflowGate, rawWorkflowGate, translate, mission }) {
  const candidates = [workflowGate, rawWorkflowGate, mission?.workflowState?.workflowGate].filter(
    Boolean
  );

  for (const candidate of candidates) {
    if (gateHasOutcomes(candidate)) {
      return normalizeGateShape(candidate, translate);
    }
  }

  if (
    mission?.missionType === "EnterInterviewOutcome" ||
    mission?.primaryAction?.id === "enter_interview_outcome"
  ) {
    return buildFallbackInterviewOutcomeGate(translate);
  }

  return buildFallbackInterviewOutcomeGate(translate);
}
