/**
 * Release 1.1 — Team Vision recruiting workflow contract for Agent intelligence.
 */

const { validateContract } = require("../../workflows/intelligence/WorkflowContracts");

function buildRecruitingWorkflow(configuration) {
  const contract = {
    name: configuration.workflowName,
    description: "Team Vision recruiting intake, qualification, and interview scheduling.",
    objective: "Qualify candidate and schedule interview",
    steps: [
      {
        id: "collect_name",
        name: "Collect Name",
        objective: "Learn the candidate name",
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
        objective: "Learn candidate location",
        requiredData: ["city", "state"],
        nextStep: "qualify_candidate"
      },
      {
        id: "qualify_candidate",
        name: "Qualify Candidate",
        objective: "Confirm eligibility and interest",
        requiredData: [
          "authorizedToWork",
          "preferredLanguage",
          "interestLevel",
          "availability"
        ],
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
      "authorizedToWork",
      "preferredLanguage",
      "interestLevel",
      "availability",
      "interviewType",
      "preferredDate",
      "preferredTime"
    ],
    completionRules: {
      type: "all_steps_complete",
      description: "All recruiting steps must be complete before scheduling."
    },
    fallbackRules: [
      {
        id: "repeat_question",
        description: "Re-ask the current step field once if the answer is unclear."
      }
    ],
    escalationRules: [
      { id: "human_request", description: "Escalate when candidate requests a human." },
      {
        id: "outside_coverage_in_person",
        description: "Escalate special in-person requests outside coverage."
      },
      {
        id: "qualification_failed",
        description: "Escalate when qualification rules fail."
      }
    ],
    availableActions: ["ANSWER", "ASK", "WAIT", "ESCALATE", "TOOL_REQUEST"],
    completionTools: [
      { toolName: "AppointmentService", operation: "scheduleInterview" },
      { toolName: "MeetingService", operation: "prepareMeeting" },
      { toolName: "CalendarService", operation: "createEvent" }
    ],
    packageMetadata: {
      packageId: configuration.packageId,
      organizationName: configuration.organizationName
    }
  };

  validateContract(contract);
  return contract;
}

module.exports = {
  buildRecruitingWorkflow
};
