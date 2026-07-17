/**
 * Sprint 8A.3 — Emits workflow events for BR-035 human advancement.
 */

const { emit, EVENT_TYPES } = require("./eventEngine");
const { MILESTONES } = require("./workflowConstants");

async function emitHumanAdvancementEvents({
  phone,
  previousMilestone,
  targetMilestone,
  ownershipBefore,
  ownershipAfter,
  capturedFields = {},
  interactionType = null,
  qualificationChanged = false,
  interviewScheduled = false
}) {
  const correlationId = `advance:${phone}:${Date.now()}`;
  const emitted = [];

  if (interactionType === "phone") {
    emitted.push(
      await emit(EVENT_TYPES.HUMAN_CALL_COMPLETED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: {
          interactionType,
          notes: capturedFields.interactionNotes || null
        }
      })
    );
  }

  if (qualificationChanged) {
    emitted.push(
      await emit(EVENT_TYPES.QUALIFICATION_UPDATED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: { source: "BR-035" }
      })
    );
  }

  if (interviewScheduled) {
    emitted.push(
      await emit(EVENT_TYPES.INTERVIEW_SCHEDULED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: {
          interviewDateTime: capturedFields.interviewDateTime || null,
          interviewType: capturedFields.interviewType || null
        }
      })
    );
  }

  if (targetMilestone === MILESTONES.CLOSED) {
    emitted.push(
      await emit(EVENT_TYPES.PROSPECT_CLOSED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: {
          closeReason: capturedFields.closureReason || capturedFields.notInterestedReason || null
        }
      })
    );
  }

  if (targetMilestone === MILESTONES.DO_NOT_CONTACT) {
    emitted.push(
      await emit(EVENT_TYPES.DO_NOT_CONTACT_APPLIED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: {
          reason: capturedFields.doNotContactReason || capturedFields.closureReason || null
        }
      })
    );
  }

  if (capturedFields.outcome) {
    emitted.push(
      await emit(EVENT_TYPES.INTERVIEW_RESULT_RECORDED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: {
          outcome: capturedFields.outcome,
          followUpDate: capturedFields.followUpDate || null
        }
      })
    );
  }

  emitted.push(
    await emit(EVENT_TYPES.PROSPECT_ADVANCED, {
      prospectPhone: phone,
      actor: "AGENT",
      milestoneBefore: previousMilestone,
      milestoneAfter: targetMilestone,
      ownershipBefore,
      ownershipAfter,
      correlationId,
      payload: {
        interactionType,
        skippedQuestions: false
      }
    })
  );

  if (ownershipBefore !== ownershipAfter) {
    emitted.push(
      await emit(EVENT_TYPES.WORKFLOW_OWNERSHIP_CHANGED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: { reason: "BR-035" }
      })
    );
  }

  if (ownershipAfter === "ATLAS" || ownershipAfter === "WAITING_EVENT") {
    emitted.push(
      await emit(EVENT_TYPES.WORKFLOW_RESUMED, {
        prospectPhone: phone,
        actor: "AGENT",
        milestoneBefore: previousMilestone,
        milestoneAfter: targetMilestone,
        ownershipBefore,
        ownershipAfter,
        correlationId,
        payload: {
          trigger: "BR-035",
          resumeFromMilestone: targetMilestone
        }
      })
    );
  }

  return emitted;
}

module.exports = {
  emitHumanAdvancementEvents
};
