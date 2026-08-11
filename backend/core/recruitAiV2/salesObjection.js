/**
 * Recruit AI v2 — sales skill / aversion objection recognition (BR-099).
 * Must outrank correction + location parsing ("no se vender" ≠ city Vender).
 */

function normalizeSalesText(text) {
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
 * @returns {"identity"|"skill"|"experience"|"aversion"|null}
 */
function classifySalesObjectionKind(text) {
  const t = normalizeSalesText(text);
  if (!t) {
    return null;
  }

  // Implements BR-137 — identity framing ("is this sales?") before skill/aversion.
  // Never answer with "we're not in sales."
  if (
    /\bis this (a )?sales\b/.test(t) ||
    /\bis this selling\b/.test(t) ||
    /\bis this (a )?sales (job|role|position|opportunity)\b/.test(t) ||
    /\bis this about sales\b/.test(t) ||
    /\bdo (i|you) (have to|need to) sell\b/.test(t) ||
    /\bes (esto|esa|esta) (de )?ventas\b/.test(t) ||
    /\besto es (de )?ventas\b/.test(t) ||
    /\bes (un trabajo|una oportunidad) de ventas\b/.test(t) ||
    /\bhay que vender\b/.test(t) ||
    /\bse trata de ventas\b/.test(t)
  ) {
    return "identity";
  }

  // Preference / aversion — do not claim "this is not sales".
  if (
    /\bno me gusta vender\b/.test(t) ||
    /\bno quiero vender\b/.test(t) ||
    /\bvender no es lo mio\b/.test(t) ||
    /\bi don'?t like selling\b/.test(t) ||
    /\bi do not like selling\b/.test(t) ||
    /\bi don'?t want to sell\b/.test(t) ||
    /\bi do not want to sell\b/.test(t) ||
    /\bsales isn'?t my thing\b/.test(t) ||
    /\bsales is not my thing\b/.test(t)
  ) {
    return "aversion";
  }

  // Lack of sales experience.
  if (
    /\bnunca he vendido\b/.test(t) ||
    /\bno tengo experiencia vendiendo\b/.test(t) ||
    /\bi'?ve never sold( anything)?\b/.test(t) ||
    /\bi have never sold( anything)?\b/.test(t) ||
    /\bi don'?t have sales experience\b/.test(t) ||
    /\bi do not have sales experience\b/.test(t)
  ) {
    return "experience";
  }

  // Skill / confidence concern (includes accent-folded "no se vender").
  if (
    /\b(yo )?no se vender\b/.test(t) ||
    /\bno soy buen[oa] vendiendo\b/.test(t) ||
    /\bno soy buen[oa] para vender\b/.test(t) ||
    /\bno soy vendedora?\b/.test(t) ||
    /\bi don'?t know how to sell\b/.test(t) ||
    /\bi do not know how to sell\b/.test(t) ||
    /\bi'?m not good at sales\b/.test(t) ||
    /\bi am not good at sales\b/.test(t) ||
    /\bi'?m not a salesperson\b/.test(t) ||
    /\bi am not a salesperson\b/.test(t)
  ) {
    return "skill";
  }

  return null;
}

function looksLikeSalesObjection(text) {
  return classifySalesObjectionKind(text) !== null;
}

module.exports = {
  normalizeSalesText,
  classifySalesObjectionKind,
  looksLikeSalesObjection
};
