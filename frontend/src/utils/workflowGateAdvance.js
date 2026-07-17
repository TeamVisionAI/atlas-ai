import { INTERVIEW_OUTCOMES } from "../types/outcomes";

function defaultFollowUpDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function buildInterviewDateTime(date, time) {
  if (!date) {
    return null;
  }

  const iso = new Date(`${date}T${time || "09:00"}`).toISOString();
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Maps UI outcome wizard state to POST /workflow/advance payloads.
 * Business validation remains on the backend (BR-037).
 */
export function mapGateOutcomeToAdvance(outcome, formState = {}) {
  const base = {
    interactionType: "phone",
    interactionNotes: `Interview outcome recorded: ${outcome}`
  };

  switch (outcome) {
    case INTERVIEW_OUTCOMES.RECRUITED:
      return {
        ...base,
        targetMilestone: "ORIENTATION",
        capturedFields: {
          outcome: "Recruited",
          orientationScheduled: Boolean(
            formState.orientationDate && formState.orientationTime
          )
        }
      };

    case INTERVIEW_OUTCOMES.NO_SHOW:
      return {
        ...base,
        targetMilestone: "FOLLOW_UP",
        capturedFields: {
          outcome: "No Show",
          followUpDate: formState.followUpDate || defaultFollowUpDate(),
          followUpTime: formState.followUpTime || "10:00"
        }
      };

    case INTERVIEW_OUTCOMES.NEEDS_MORE_TIME:
      return {
        ...base,
        targetMilestone: "FOLLOW_UP",
        capturedFields: {
          outcome: "Needs More Time",
          followUpDate: formState.followUpDate,
          followUpTime: formState.followUpTime || "10:00"
        }
      };

    case INTERVIEW_OUTCOMES.NOT_INTERESTED:
      return {
        ...base,
        targetMilestone: "CLOSED",
        capturedFields: {
          outcome: "Not Interested",
          closureReason: formState.notInterestedReason || null,
          futureReminder: formState.futureReminder || null
        }
      };

    case INTERVIEW_OUTCOMES.RESCHEDULED: {
      const interviewDateTime = buildInterviewDateTime(
        formState.rescheduleDate,
        formState.rescheduleTime
      );

      return {
        ...base,
        targetMilestone: "INTERVIEW_SCHEDULED",
        capturedFields: {
          interviewDateTime,
          interviewType: formState.rescheduleInterviewType || "Zoom",
          confirmed: true
        }
      };
    }

    default:
      throw new Error(`Unsupported gate outcome: ${outcome}`);
  }
}
