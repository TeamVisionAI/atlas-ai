/**
 * Conversations Center pilot access gate — Niovel + Team Vision only.
 * Do not widen.
 */

const {
  TEAM_VISION_ORG_ID,
  NIOVEL_USER_ID
} = require("./constants");

function assertConversationsCenterPilotAccess({ userId, organizationId }) {
  if (String(organizationId || "") !== TEAM_VISION_ORG_ID) {
    const error = new Error("Conversations Center pilot is limited to Team Vision");
    error.statusCode = 403;
    error.code = "CONVERSATIONS_CENTER_ORG_FORBIDDEN";
    throw error;
  }

  if (String(userId || "") !== NIOVEL_USER_ID) {
    const error = new Error("Conversations Center pilot is limited to Niovel");
    error.statusCode = 403;
    error.code = "CONVERSATIONS_CENTER_USER_FORBIDDEN";
    throw error;
  }

  return true;
}

function isConversationsCenterPilotUser({ userId, organizationId }) {
  try {
    assertConversationsCenterPilotAccess({ userId, organizationId });
    return true;
  } catch {
    return false;
  }
}

/** Prospects visible in Niovel pilot — owned by Niovel or unassigned in Team Vision. */
function isProspectInNiovelPilotScope(prospect) {
  if (!prospect) {
    return false;
  }

  if (String(prospect.organization_id || "") !== TEAM_VISION_ORG_ID) {
    return false;
  }

  const owner = prospect.owner_user_id || null;
  return !owner || String(owner) === NIOVEL_USER_ID;
}

module.exports = {
  assertConversationsCenterPilotAccess,
  isConversationsCenterPilotUser,
  isProspectInNiovelPilotScope
};
