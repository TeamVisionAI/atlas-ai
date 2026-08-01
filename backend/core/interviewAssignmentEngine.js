/**
 * Sprint 13.2 — Interview Assignment (BR-042).
 * Appointment interviewer fields are the single source of truth for interview communications.
 */

const { findUserById, sanitizeUser } = require("../services/atlasUserService");
const { resolveRecruiterDisplayName } = require("./whatsappCommunicationEngine");
const { logInterviewerTrace } = require("../dev/interviewerTrace");

function resolveInterviewerUserId(appointment = {}) {
  return (
    appointment.interviewerUserId ||
    appointment.interviewer_user_id ||
    appointment.metadata?.interviewerUserId ||
    appointment.metadata?.interviewer_user_id ||
    null
  );
}

function resolveInterviewerName(appointment = {}) {
  return (
    appointment.interviewerName ||
    appointment.interviewer_name ||
    appointment.metadata?.interviewerName ||
    appointment.metadata?.interviewer_name ||
    null
  );
}

function resolveInterviewerUserIdFallback(appointment = {}) {
  return (
    resolveInterviewerUserId(appointment) ||
    appointment.createdBy ||
    appointment.created_by ||
    appointment.agentId ||
    appointment.agent_id ||
    null
  );
}

function resolveInterviewerDisplayName(user, storedName = null) {
  return storedName || resolveRecruiterDisplayName(user) || null;
}

async function resolveInterviewerUser(userId, organizationId, deps = {}) {
  const findUser = deps.findUserById || findUserById;

  if (!userId) {
    return null;
  }

  const user = await findUser(userId);

  if (!user) {
    return null;
  }

  if (organizationId && user.organization_id && user.organization_id !== organizationId) {
    return null;
  }

  return deps.sanitizeUser ? deps.sanitizeUser(user) : sanitizeUser(user);
}

/**
 * Resolves interviewer identity from appointment assignment only (BR-042).
 */
async function resolveInterviewRepresentative(appointment, context = {}, deps = {}) {
  const organizationId = context.organizationId || appointment.organizationId;
  const interviewerUserId = resolveInterviewerUserIdFallback(appointment);
  const storedName = resolveInterviewerName(appointment);
  const user = await resolveInterviewerUser(interviewerUserId, organizationId, deps);

  if (user) {
    const { buildRepresentativeProfileFromUser } = require("./representativeProfileEngine");
    const resolved = {
      user,
      profile: buildRepresentativeProfileFromUser(user),
      fallbackUsed: false,
      interviewerUserId: user.id,
      interviewerName: resolveInterviewerDisplayName(user, storedName)
    };

    logInterviewerTrace({
      authenticatedUserId: context.actorUser?.id || null,
      authenticatedUserName: resolveRecruiterDisplayName(context.actorUser),
      interviewerUserId: appointment?.interviewerUserId || interviewerUserId,
      interviewerName: appointment?.interviewerName || storedName,
      appointmentId: appointment?.id || null,
      source: "interviewAssignmentEngine.resolveInterviewRepresentative"
    });

    logInterviewerTrace({
      authenticatedUserId: context.actorUser?.id || null,
      authenticatedUserName: resolveRecruiterDisplayName(context.actorUser),
      interviewerUserId: resolved.interviewerUserId,
      interviewerName: resolved.interviewerName,
      appointmentId: appointment?.id || null,
      source: "interviewAssignmentEngine.resolveInterviewRepresentative.resolved"
    });

    return resolved;
  }

  console.warn("[interviewAssignment] Interviewer user could not be resolved.", {
    appointmentId: appointment?.id || null,
    interviewerUserId
  });

  return {
    user: null,
    profile: null,
    fallbackUsed: true,
    interviewerUserId,
    interviewerName: storedName
  };
}

async function resolveDefaultInterviewAssignment(actorUser) {
  if (!actorUser?.id) {
    return {
      interviewerUserId: null,
      interviewerName: null
    };
  }

  const sanitized = sanitizeUser(actorUser);

  return {
    interviewerUserId: sanitized.id,
    interviewerName: resolveRecruiterDisplayName(sanitized)
  };
}

async function resolveInterviewAssignmentForSchedule(payload = {}, context = {}, deps = {}) {
  const actorUserId = context.userId || context.agentId || context.authorUserId || null;
  const requestedUserId = payload.interviewerUserId || payload.interviewer_user_id || actorUserId;

  if (!requestedUserId) {
    throw new Error("Missing authenticated user for interview assignment.");
  }

  const organizationId = context.organizationId || null;
  const user = await resolveInterviewerUser(requestedUserId, organizationId, deps);

  if (!user) {
    throw new Error("Selected interviewer is not available in this organization.");
  }

  return {
    interviewerUserId: user.id,
    interviewerName: resolveRecruiterDisplayName(user)
  };
}

function attachInterviewAssignmentFields(appointment, assignment = {}) {
  const interviewerUserId = assignment.interviewerUserId || null;
  const interviewerName = assignment.interviewerName || null;

  return {
    ...appointment,
    interviewerUserId,
    interviewerName,
    metadata: {
      ...(appointment.metadata || {}),
      interviewerUserId,
      interviewerName
    }
  };
}

module.exports = {
  resolveInterviewerUserId,
  resolveInterviewerName,
  resolveInterviewerUserIdFallback,
  resolveInterviewerDisplayName,
  resolveInterviewRepresentative,
  resolveDefaultInterviewAssignment,
  resolveInterviewAssignmentForSchedule,
  attachInterviewAssignmentFields
};
