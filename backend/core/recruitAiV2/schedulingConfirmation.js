/**
 * Recruit AI v2 — acknowledgement vs appointment confirmation (BR-103).
 * schedule_confirm requires a concrete confirmable proposal, not a bare "ok".
 */

function normalizeAscii(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Soft acknowledgements — continuation signals, not booking confirmation.
 */
function isSoftAcknowledgement(text) {
  const t = normalizeAscii(text)
    .replace(/[?!¡¿.,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) {
    return false;
  }
  return /^(ok|okay|dale|perfecto|esta bien|bien|gracias|sounds good|got it|thanks|thank you|de acuerdo|that works)$/i.test(
    t
  );
}

/**
 * True when Atlas has presented a concrete candidate the prospect can accept.
 * Preference capture / "I'll check availability" is NOT confirmable.
 */
function hasConfirmableAppointmentProposal(context = {}) {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  const lastOut = String(context?.conversation?.lastAtlasOutboundText || "");
  const proposedTime = context?.appointment?.proposedTime || null;
  const proposedDate = context?.appointment?.proposedDate || null;
  const offered = Array.isArray(context?.appointment?.previouslyOfferedSlots)
    ? context.appointment.previouslyOfferedSlots
    : [];

  // Explicit non-confirmable states after preference capture.
  // offer_time_choices: multi-option menus require a selection first;
  // a single concrete offer with ¿Te funciona? is confirmable (BR-111 canary).
  if (
    lastQ === "awaiting_availability" ||
    lastQ === "check_availability" ||
    lastQ === "ask_time_preference" ||
    lastQ === "ask_day_part"
  ) {
    return false;
  }

  if (lastQ === "offer_time_choices") {
    const asksSingleConfirm =
      /\b(te funciona|le funciona|does that work|does this work)\b/i.test(lastOut);
    if (offered.length === 1 && asksSingleConfirm) {
      return true;
    }
    return false;
  }

  // Atlas only promised to review availability — never confirm from that.
  if (
    /\brevisar disponibilidad\b/i.test(lastOut) ||
    /\bcheck(?:ing)? availability\b/i.test(lastOut) ||
    /\bcomparto opciones\b/i.test(lastOut) ||
    /\bshare (?:some )?options\b/i.test(lastOut)
  ) {
    return false;
  }

  const asksConfirm =
    /\b(te funciona|le funciona|does that work|does this work|can you make it|does that time work|reply yes to confirm|confirm(a|as|amos)?|confirmar)\b/i.test(
      lastOut
    );

  // Explicit confirm ask on confirm_slot — even if proposedTime was sparsely seeded.
  if (lastQ === "confirm_slot" && asksConfirm) {
    return true;
  }

  if (!proposedTime) {
    return false;
  }

  // Concrete date+time (or offered menu) with an active confirm ask / date.
  if (lastQ === "confirm_slot" && (proposedDate || offered.length > 0)) {
    return true;
  }

  return false;
}

module.exports = {
  isSoftAcknowledgement,
  hasConfirmableAppointmentProposal
};
