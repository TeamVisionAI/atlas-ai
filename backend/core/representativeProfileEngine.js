/**
 * Representative profile resolver — prospect-facing identity for communications.
 * Implements BR-042 — reads appointment interviewer assignment only.
 */

const { resolveRecruiterDisplayName } = require("./whatsappCommunicationEngine");

function buildRepresentativeProfileFromUser(user) {
  if (!user) {
    return null;
  }

  return {
    name: resolveRecruiterDisplayName(user),
    repId: user.rep_id || user.repId || null,
    phone: user.phone || null,
    email: user.email || null,
    office: null,
    preferredLanguage: user.preferred_language || user.preferredLanguage || "en",
    timezone: user.timezone || null
  };
}

async function resolveAssignedRepresentative(appointment, context = {}, deps = {}) {
  const { resolveInterviewRepresentative } = require("./interviewAssignmentEngine");
  return resolveInterviewRepresentative(appointment, context, deps);
}

module.exports = {
  buildRepresentativeProfileFromUser,
  resolveAssignedRepresentative
};
