/**
 * Ordered interviewer pool for recruiting availability (BR-162).
 * Configuration only — never hardcodes a tenant UUID into slot math.
 */

const POOL_ROLES = Object.freeze({
  PRIMARY: "primary",
  OVERFLOW: "overflow"
});

const ASSIGNMENT_MODES = Object.freeze({
  AUTO: "auto",
  EXPLICIT: "explicit"
});

function normalizePoolMember(raw, index = 0) {
  const userId = String(raw?.userId || raw?.user_id || "").trim();
  if (!userId) {
    return null;
  }

  const role =
    String(raw?.role || "").trim().toLowerCase() === POOL_ROLES.PRIMARY
      ? POOL_ROLES.PRIMARY
      : POOL_ROLES.OVERFLOW;

  const order = Number(raw?.order);
  return {
    userId,
    role,
    order: Number.isFinite(order) ? order : index + 1,
    displayName: String(raw?.displayName || raw?.display_name || "").trim() || null
  };
}

function normalizeInterviewerPool(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const members = (Array.isArray(source.members) ? source.members : [])
    .map((member, index) => normalizePoolMember(member, index))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      if (left.role === right.role) {
        return 0;
      }
      return left.role === POOL_ROLES.PRIMARY ? -1 : 1;
    });

  return {
    enabled: source.enabled === true && members.length > 0,
    members
  };
}

function resolveAssignmentMode({ assignmentMode, poolEnabled } = {}) {
  const requested = String(assignmentMode || "")
    .trim()
    .toLowerCase();

  if (requested === ASSIGNMENT_MODES.AUTO || requested === ASSIGNMENT_MODES.EXPLICIT) {
    return requested;
  }

  return poolEnabled ? ASSIGNMENT_MODES.AUTO : ASSIGNMENT_MODES.EXPLICIT;
}

function appointmentBelongsToInterviewer(appointment, interviewerUserId) {
  if (!interviewerUserId) {
    return false;
  }

  const interviewer =
    appointment?.interviewerUserId || appointment?.interviewer_user_id || null;
  const agent = appointment?.agentId || appointment?.agent_id || null;

  if (interviewer) {
    return String(interviewer) === String(interviewerUserId);
  }

  if (agent) {
    return String(agent) === String(interviewerUserId);
  }

  // Legacy/test rows with no owner remain conflicts for the requested interviewer.
  return true;
}

function mergePooledSlots(memberSlotLists = []) {
  const byKey = new Map();

  for (const { member, slots } of memberSlotLists) {
    for (const slot of slots || []) {
      const key = `${slot.dateKey}|${slot.timeKey}`;
      if (byKey.has(key)) {
        continue;
      }

      byKey.set(key, {
        ...slot,
        assignedInterviewerUserId: member.userId,
        assignedInterviewerName: member.displayName || slot.assignedInterviewerName || null,
        assignmentMode: ASSIGNMENT_MODES.AUTO
      });
    }
  }

  return [...byKey.values()].sort((left, right) => {
    const dateCmp = String(left.dateKey).localeCompare(String(right.dateKey));
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return String(left.timeKey).localeCompare(String(right.timeKey));
  });
}

module.exports = {
  POOL_ROLES,
  ASSIGNMENT_MODES,
  normalizeInterviewerPool,
  normalizePoolMember,
  resolveAssignmentMode,
  appointmentBelongsToInterviewer,
  mergePooledSlots
};
