/**
 * Journey #5 Increment 2 — Workflow contract definitions for Agent reasoning.
 * Agent consumes contracts. Workflows are never hardcoded in Decision Engine.
 */

const FIELD_LABELS = Object.freeze({
  name: "full name",
  email: "email address",
  phone: "phone number",
  city: "city",
  state: "state",
  authorizedToWork: "work authorization status",
  interviewType: "preferred meeting type",
  preferredDate: "preferred date",
  preferredTime: "preferred time"
});

const GENERIC_INTAKE_WORKFLOW = Object.freeze({
  name: "generic-intake",
  description: "Collect basic contact information before scheduling.",
  objective: "Collect contact information",
  steps: [
    {
      id: "collect_name",
      name: "Collect Name",
      objective: "Learn the prospect name",
      requiredData: ["name"],
      nextStep: "collect_email"
    },
    {
      id: "collect_email",
      name: "Collect Email",
      objective: "Learn the prospect email",
      requiredData: ["email"],
      nextStep: "collect_phone"
    },
    {
      id: "collect_phone",
      name: "Collect Phone",
      objective: "Learn the prospect phone number",
      requiredData: ["phone"],
      nextStep: null
    }
  ],
  requiredData: ["name", "email", "phone"],
  completionRules: {
    type: "all_steps_complete",
    description: "All workflow steps must be complete."
  },
  fallbackRules: [
    {
      id: "repeat_question",
      description: "Re-ask the current step field once if the answer is unclear."
    }
  ],
  escalationRules: [
    {
      id: "human_request",
      description: "Escalate when the prospect requests a human."
    }
  ],
  availableActions: ["ANSWER", "ASK", "WAIT", "ESCALATE", "TOOL_REQUEST"],
  completionTools: [
    {
      toolName: "AppointmentService",
      operation: "scheduleInterview"
    }
  ]
});

const TEAM_VISION_INTAKE_WORKFLOW = Object.freeze({
  name: "team-vision-intake",
  description: "Recruiting intake for Team Vision prospects.",
  objective: "Qualify prospect and prepare for interview scheduling",
  steps: [
    {
      id: "collect_name",
      name: "Collect Name",
      objective: "Learn the prospect name",
      requiredData: ["name"],
      nextStep: "collect_contact"
    },
    {
      id: "collect_contact",
      name: "Collect Contact",
      objective: "Collect email and phone",
      requiredData: ["email", "phone"],
      nextStep: "collect_location"
    },
    {
      id: "collect_location",
      name: "Collect Location",
      objective: "Learn where the prospect is located",
      requiredData: ["city", "state"],
      nextStep: "collect_scheduling"
    },
    {
      id: "collect_scheduling",
      name: "Collect Scheduling Preferences",
      objective: "Learn interview preferences",
      requiredData: ["interviewType", "preferredDate", "preferredTime"],
      nextStep: null
    }
  ],
  requiredData: [
    "name",
    "email",
    "phone",
    "city",
    "state",
    "interviewType",
    "preferredDate",
    "preferredTime"
  ],
  completionRules: {
    type: "all_steps_complete",
    description: "All intake steps must be complete before scheduling."
  },
  fallbackRules: [
    {
      id: "repeat_question",
      description: "Re-ask the current step field once if the answer is unclear."
    }
  ],
  escalationRules: [
    {
      id: "human_request",
      description: "Escalate when the prospect requests a human."
    },
    {
      id: "outside_coverage_in_person",
      description: "Escalate special in-person requests outside coverage."
    }
  ],
  availableActions: ["ANSWER", "ASK", "WAIT", "ESCALATE", "TOOL_REQUEST"],
  completionTools: [
    {
      toolName: "AppointmentService",
      operation: "scheduleInterview"
    },
    {
      toolName: "MeetingService",
      operation: "prepareMeeting"
    },
    {
      toolName: "CalendarService",
      operation: "createEvent"
    }
  ]
});

const BUILTIN_WORKFLOWS = [GENERIC_INTAKE_WORKFLOW, TEAM_VISION_INTAKE_WORKFLOW];

function getFieldLabel(fieldName) {
  return FIELD_LABELS[fieldName] || fieldName.replace(/([A-Z])/g, " $1").trim();
}

function validateContract(contract) {
  if (!contract?.name) {
    throw new Error("Workflow contract requires name");
  }

  if (!contract.objective) {
    throw new Error(`Workflow "${contract.name}" requires objective`);
  }

  if (!Array.isArray(contract.steps) || contract.steps.length === 0) {
    throw new Error(`Workflow "${contract.name}" requires steps`);
  }

  for (const step of contract.steps) {
    if (!step.id) {
      throw new Error(`Workflow "${contract.name}" step requires id`);
    }
  }

  return true;
}

module.exports = {
  FIELD_LABELS,
  GENERIC_INTAKE_WORKFLOW,
  TEAM_VISION_INTAKE_WORKFLOW,
  BUILTIN_WORKFLOWS,
  getFieldLabel,
  validateContract
};
