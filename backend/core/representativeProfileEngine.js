/**
 * Representative profile resolver — prospect-facing identity for communications.
 * Future-ready fields: profilePhoto, signature, officeLogo, qrCode, calendarAttachment.
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
  const findUserByRepId =
    deps.findUserByRepId ||
    require("../services/atlasUserService").findUserByRepId;
  const sanitizeUser =
    deps.sanitizeUser || require("../services/atlasUserService").sanitizeUser;

  const organizationId = context.organizationId || appointment.organizationId;
  const ownerRepId = appointment.ownerRepId || appointment.metadata?.ownerRepId || null;

  if (ownerRepId) {
    const user = await findUserByRepId(ownerRepId, organizationId);

    if (user) {
      const sanitized = sanitizeUser(user);

      return {
        user: sanitized,
        profile: buildRepresentativeProfileFromUser(sanitized),
        fallbackUsed: false
      };
    }
  }

  const fallbackUser = context.actorUser || null;

  if (!fallbackUser) {
    console.warn("[representativeProfile] No assigned representative and no operator fallback.", {
      appointmentId: appointment.id,
      ownerRepId
    });

    return {
      user: null,
      profile: null,
      fallbackUsed: true
    };
  }

  console.warn(
    "[representativeProfile] Assigned representative unavailable; falling back to operator.",
    {
      appointmentId: appointment.id,
      ownerRepId
    }
  );

  return {
    user: fallbackUser,
    profile: buildRepresentativeProfileFromUser(fallbackUser),
    fallbackUsed: true
  };
}

module.exports = {
  buildRepresentativeProfileFromUser,
  resolveAssignedRepresentative
};
