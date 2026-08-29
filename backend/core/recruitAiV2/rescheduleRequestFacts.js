/**
 * BR-171 — Natural-language reschedule / cannot-attend detection.
 * Shared by interpreter and inbound attention (HUMAN/TAKE OVER).
 */

function fold(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCannotAttendCurrentAppointment(text) {
  const t = fold(text);
  if (!t) {
    return false;
  }
  return (
    /\bno podr[e]? asistir\b/.test(t) ||
    /\bno (puedo|voy a) (ir|asistir|llegar)\b/.test(t) ||
    /\bno puedo ir\b/.test(t) ||
    /\bcan'?t make it\b/.test(t) ||
    /\bcannot make it\b/.test(t) ||
    /\bcan'?t attend\b/.test(t) ||
    /\bcannot attend\b/.test(t) ||
    /\bun compromiso\b/.test(t) && /\basistir\b/.test(t)
  );
}

function looksLikeRescheduleVerb(text) {
  const t = fold(text);
  if (!t) {
    return false;
  }
  return (
    /\breprogramar(la|lo|las|los)?\b/.test(t) ||
    /\breprogramacion\b/.test(t) ||
    /\breschedule\b/.test(t) ||
    /\bcambiar(la|lo)\b/.test(t) ||
    /\bcambiar (la )?(cita|entrevista|hora)\b/.test(t) ||
    /\bmover (la )?(cita|entrevista)\b/.test(t) ||
    /\bmove (my )?(interview|appointment)\b/.test(t) ||
    /\bcan we (reschedule|move|change)\b/.test(t) ||
    /\bnecesito reprogramar/.test(t) ||
    /\bcambiar (la )?hora\b/.test(t) ||
    /\bpodemos cambiar\b/.test(t)
  );
}

function hasAlternateDateHint(text) {
  const t = fold(text);
  if (!t) {
    return false;
  }
  return (
    /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(t) ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t) ||
    /\b(manana|pasado manana|next week|la proxima semana)\b/.test(t) ||
    /\bpara el\b/.test(t)
  );
}

function hasExistingAppointment(context = {}) {
  const status = String(context?.appointment?.status || "").toLowerCase();
  return (
    Boolean(context?.appointment?.appointmentId) ||
    status === "confirmed" ||
    status === "scheduled" ||
    status === "rescheduled" ||
    status === "reschedule_requested"
  );
}

/**
 * ATLAS conversational reschedule: verbs, or cannot-attend plus a date,
 * or cannot-attend while an appointment is already on context.
 */
function looksLikeRescheduleRequest(text, context = {}) {
  if (looksLikeRescheduleVerb(text)) {
    return true;
  }
  if (!looksLikeCannotAttendCurrentAppointment(text)) {
    return false;
  }
  return hasAlternateDateHint(text) || hasExistingAppointment(context);
}

function looksLikeHumanOwnedRescheduleAttention(text) {
  return looksLikeRescheduleVerb(text) || looksLikeCannotAttendCurrentAppointment(text);
}

module.exports = {
  looksLikeRescheduleRequest,
  looksLikeRescheduleVerb,
  looksLikeCannotAttendCurrentAppointment,
  looksLikeHumanOwnedRescheduleAttention,
  hasExistingAppointment,
  HUMAN_ATTENTION_RESCHEDULE_REASON: "appointment_reschedule_requested"
};
