/**
 * Recruit AI v2 — BR-137 conversation objections + optional prospect-goal capture.
 * Detection only; copy lives in teamVisionWorkflowCopy. No scheduling mutation.
 */

"use strict";

function normalizeObjectionText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identity framing: "Is this sales?" (not skill/aversion — those stay in salesObjection.js).
 */
function looksLikeIsThisSales(text) {
  const t = normalizeObjectionText(text);
  if (!t) {
    return false;
  }
  return (
    /\bis this (a )?sales\b/.test(t) ||
    /\bis this selling\b/.test(t) ||
    /\bis this (a )?sales (job|role|position|opportunity)\b/.test(t) ||
    /\bis this about sales\b/.test(t) ||
    /\bdo (i|you) (have to|need to) sell\b/.test(t) ||
    /\bes (esto|esa|esta) (de )?ventas\b/.test(t) ||
    /\besto es (de )?ventas\b/.test(t) ||
    /\bes (un trabajo|una oportunidad) de ventas\b/.test(t) ||
    /\btienen (que|que) vender\b/.test(t) ||
    /\bhay que vender\b/.test(t) ||
    /\bse trata de ventas\b/.test(t)
  );
}

function looksLikeThinkAboutIt(text) {
  const t = normalizeObjectionText(text);
  if (!t) {
    return false;
  }
  // Do not catch "I think it's great" / schedule thoughts.
  if (
    /\b(think|pienso|creo)\b/.test(t) &&
    /\b(morning|afternoon|tarde|manana|zoom|fecha|day|time|hora)\b/.test(t)
  ) {
    return false;
  }
  return (
    /\bi need to think( about it)?\b/.test(t) ||
    /\blet me think( about it)?\b/.test(t) ||
    /\bi('?ll| will) think( about it)?\b/.test(t) ||
    /\bi('?m| am) going to think( about it)?\b/.test(t) ||
    /\bgive me (some )?time to think\b/.test(t) ||
    /\bi('?ll| will) get back to you\b/.test(t) ||
    /\bnecesito pensarlo\b/.test(t) ||
    /\bdejame pensarlo\b/.test(t) ||
    /\bdejame pensar\b/.test(t) ||
    /\blo voy a pensar\b/.test(t) ||
    /\bvoy a pensarlo\b/.test(t) ||
    /\bquiero pensarlo\b/.test(t) ||
    /\bnecesito pensarlo bien\b/.test(t) ||
    (/\blo pienso\b/.test(t) && t.length < 40)
  );
}

function looksLikeLegitimacyTrust(text) {
  const t = normalizeObjectionText(text);
  if (!t) {
    return false;
  }
  return (
    /\bis this (a )?scam\b/.test(t) ||
    /\bis this legit(imate)?\b/.test(t) ||
    /\bis this real\b/.test(t) ||
    /\bis this a pyramid\b/.test(t) ||
    /\bis this mlm\b/.test(t) ||
    /\bsounds (like )?(a )?scam\b/.test(t) ||
    /\bthis (looks|sounds|seems) (like )?(a )?(scam|suspicious)\b/.test(t) ||
    /\bcan i trust (this|you|them)\b/.test(t) ||
    /\bes (esto )?(una )?estafa\b/.test(t) ||
    /\bes legitimo\b/.test(t) ||
    /\bes legitima\b/.test(t) ||
    /\bes real\b/.test(t) ||
    /\bparece (una )?estafa\b/.test(t) ||
    /\bes piramide\b/.test(t) ||
    /\bse puede confiar\b/.test(t) ||
    /\bme da desconfianza\b/.test(t)
  );
}

function looksLikeDontWantToRecruit(text) {
  const t = normalizeObjectionText(text);
  if (!t) {
    return false;
  }
  return (
    /\bi don'?t want to recruit\b/.test(t) ||
    /\bi do not want to recruit\b/.test(t) ||
    /\bi('?m| am) not interested in recruiting\b/.test(t) ||
    /\bi don'?t want to recruit people\b/.test(t) ||
    /\bi do not want to recruit people\b/.test(t) ||
    /\bno recruiting\b/.test(t) ||
    /\bi don'?t want to (build|grow) (a )?team\b/.test(t) ||
    /\bno quiero reclutar\b/.test(t) ||
    /\bno quiero reclutar (a )?(gente|personas)\b/.test(t) ||
    /\bno me interesa reclutar\b/.test(t) ||
    /\bno quiero (armar|formar|crecer) (un )?equipo\b/.test(t)
  );
}

/**
 * Optional prospect motivation themes — not qualification fields.
 * @returns {{ theme: string, rawHint: string } | null}
 */
function classifyProspectGoal(text) {
  const t = normalizeObjectionText(text);
  if (!t || t.length > 160) {
    return null;
  }
  // Prefer stated motives, not bare FAQ keyword questions already owned elsewhere.
  const stated =
    /\b(i('?m| am) looking for|looking for|hoping for|my goal|me interesa|busco|quiero|me importa|lo que busco|lo que me interesa)\b/.test(
      t
    ) ||
    /\b(i want (more )?(flexibility|extra income|to help|to learn|to own|a career))\b/.test(
      t
    );

  if (!stated && !/\b(flexibility|flexibilidad|extra income|ingreso extra|career change|cambio de carrera|help(ing)? families|ayudar (a )?familias|business ownership|tener mi (propio )?negocio|leadership|liderazgo)\b/.test(t)) {
    return null;
  }

  if (/\b(flexibility|flexibilidad|flexible|horario flexible|part[- ]?time|medio tiempo)\b/.test(t)) {
    return { theme: "flexibility", rawHint: t.slice(0, 120) };
  }
  if (/\b(extra income|side income|ingreso extra|dinero extra|make more|ganar mas)\b/.test(t)) {
    return { theme: "extra_income", rawHint: t.slice(0, 120) };
  }
  if (/\b(own (my|a) business|business ownership|mi (propio )?negocio|emprender)\b/.test(t)) {
    return { theme: "business_ownership", rawHint: t.slice(0, 120) };
  }
  if (/\b(career change|cambio de carrera|new career|nueva carrera)\b/.test(t)) {
    return { theme: "career_change", rawHint: t.slice(0, 120) };
  }
  if (/\b(learn(ing)? (about )?financ|aprender (sobre )?financ|educat)\b/.test(t)) {
    return { theme: "learning_finance", rawHint: t.slice(0, 120) };
  }
  if (/\b(help(ing)? families|ayudar (a )?familias|help people|ayudar (a )?gente)\b/.test(t)) {
    return { theme: "helping_families", rawHint: t.slice(0, 120) };
  }
  if (/\b(leadership|liderazgo|growth|crecimiento|advance)\b/.test(t)) {
    return { theme: "leadership_growth", rawHint: t.slice(0, 120) };
  }
  if (stated) {
    return { theme: "other", rawHint: t.slice(0, 120) };
  }
  return null;
}

function isQualificationCompleteForInterview(facts = {}) {
  const cityOk =
    Boolean(facts.city) &&
    (facts.cityCertainty == null ||
      facts.cityCertainty === "confirmed" ||
      facts.cityCertainty === "partial");
  const stateOk =
    Boolean(facts.state) &&
    (facts.stateCertainty == null ||
      facts.stateCertainty === "confirmed" ||
      Boolean(facts.state));
  const authKnown =
    facts.workAuthorization === true ||
    facts.workAuthorization === false ||
    String(facts.workAuthorizationStatus || "").toLowerCase() === "authorized" ||
    String(facts.workAuthorizationStatus || "").toLowerCase() === "not_authorized";
  return Boolean(cityOk && stateOk && authKnown);
}

function shouldSoftInviteInterview(facts = {}, resumeLastQuestionAsked = null) {
  if (!isQualificationCompleteForInterview(facts)) {
    return false;
  }
  const q = String(resumeLastQuestionAsked || "");
  return (
    q === "ask_day_part" ||
    q === "ask_time_preference" ||
    q === "ask_time" ||
    q === "awaiting_availability"
  );
}

module.exports = {
  normalizeObjectionText,
  looksLikeIsThisSales,
  looksLikeThinkAboutIt,
  looksLikeLegitimacyTrust,
  looksLikeDontWantToRecruit,
  classifyProspectGoal,
  isQualificationCompleteForInterview,
  shouldSoftInviteInterview
};
