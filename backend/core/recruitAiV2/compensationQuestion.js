/**
 * Recruit AI v2 — compensation / earnings FAQ recognition (BR-104).
 * Must outrank ask_time / location / fragment / generic clarify.
 */

function normalizeCompensationText(text) {
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
 * Progressive disclosure kinds (most specific first).
 * @returns {"commission"|"hourly"|"salary"|"how_much"|"pay_how"|"source"|"general"|null}
 */
function classifyCompensationQuestionKind(text) {
  const t = normalizeCompensationText(text);
  if (!t) {
    return null;
  }

  if (
    /\bes por comision\b/.test(t) ||
    /\bes comision\b/.test(t) ||
    /\bis it commission\b/.test(t) ||
    /\bis this commission\b/.test(t) ||
    /\b(salary|sueldo|salario|commission|comision)\b.*\b(o|or)\b.*\b(commission|comision|salary|sueldo|salario)\b/.test(
      t
    )
  ) {
    return "commission";
  }

  if (
    /\bpagan por hora\b/.test(t) ||
    /\bes por hora\b/.test(t) ||
    /\btrabajo por hora\b/.test(t) ||
    /\bis it hourly\b/.test(t) ||
    /\bis this hourly\b/.test(t) ||
    /\bdo (you|they) pay (by the )?hour\b/.test(t)
  ) {
    return "hourly";
  }

  if (
    /\bhay salario\b/.test(t) ||
    /\btiene salario\b/.test(t) ||
    /\btengo salario\b/.test(t) ||
    /\bhay sueldo\b/.test(t) ||
    /\bis there a salary\b/.test(t) ||
    /\bis there a (fixed )?salary\b/.test(t) ||
    /\bdoes it (have|pay) (a )?salary\b/.test(t)
  ) {
    return "salary";
  }

  if (
    /\bcuanto pagan\b/.test(t) ||
    /\bcuanto se gana\b/.test(t) ||
    /\bcuanto (puedo|voy a) ganar\b/.test(t) ||
    /\bcuanto gano\b/.test(t) ||
    /\bhow much (do|can) i make\b/.test(t) ||
    /\bhow much money do i make\b/.test(t) ||
    /\bhow much does it pay\b/.test(t) ||
    /\bhow much do (you|they) pay\b/.test(t) ||
    /\bwhat'?s the (pay|compensation)\b/.test(t) ||
    /\bwhats the (pay|compensation)\b/.test(t)
  ) {
    return "how_much";
  }

  if (
    /\bcomo me pagan\b/.test(t) ||
    /\bcomo funciona el pago\b/.test(t) ||
    /\bcomo funciona la compensacion\b/.test(t) ||
    /\bhow do i get paid\b/.test(t) ||
    /\bhow do you get paid\b/.test(t) ||
    /\bhow does the pay work\b/.test(t) ||
    /\bhow does compensation work\b/.test(t)
  ) {
    return "pay_how";
  }

  if (
    /\bde donde sale el dinero\b/.test(t) ||
    /\bwhere does the money come from\b/.test(t)
  ) {
    return "source";
  }

  if (
    /\b(entonces )?como voy a ganar dinero\b/.test(t) ||
    /\bcomo se gana dinero\b/.test(t) ||
    /\bcomo gano yo\b/.test(t) ||
    /\bcomo gano dinero\b/.test(t) ||
    /\bhow do i make money\b/.test(t) ||
    /\bhow (do|would) i earn\b/.test(t) ||
    /\b(salary|sueldo|salario|commission|comision)\b/.test(t)
  ) {
    return "general";
  }

  return null;
}

function looksLikeCompensationQuestion(text) {
  return classifyCompensationQuestionKind(text) !== null;
}

module.exports = {
  normalizeCompensationText,
  classifyCompensationQuestionKind,
  looksLikeCompensationQuestion
};
