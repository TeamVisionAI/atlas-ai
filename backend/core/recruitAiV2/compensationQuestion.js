/**
 * Recruit AI v2 — compensation / earnings FAQ recognition (BR-104).
 * Must outrank ask_time / location / fragment / generic clarify.
 *
 * Broader intent remains `compensation_question`.
 * Detail kinds (progressive disclosure):
 * - commission_question
 * - hourly_pay_question
 * - salary_question
 * - fixed_pay_question
 * - how_much | pay_how | source | general
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
 * @returns {string|null}
 */
function classifyCompensationQuestionKind(text) {
  const t = normalizeCompensationText(text);
  if (!t) {
    return null;
  }

  // Commission
  if (
    /\bes por comision\b/.test(t) ||
    /\bes comision\b/.test(t) ||
    /\bpagan comision\b/.test(t) ||
    /\bis it commission( based)?\b/.test(t) ||
    /\bis this commission( based)?\b/.test(t) ||
    /\b(salary|sueldo|salario|commission|comision)\b.*\b(o|or)\b.*\b(commission|comision|salary|sueldo|salario)\b/.test(
      t
    )
  ) {
    return "commission_question";
  }

  // Fixed pay (before bare salary/sueldo)
  if (
    /\bes pago fijo\b/.test(t) ||
    /\bel pago es fijo\b/.test(t) ||
    /\bpagan fijo\b/.test(t) ||
    /\bes sueldo fijo\b/.test(t) ||
    /\bes salario fijo\b/.test(t) ||
    /\bis it fixed pay\b/.test(t) ||
    /\bis the pay fixed\b/.test(t) ||
    /\bis it a fixed salary\b/.test(t) ||
    /\bis (the )?pay fixed\b/.test(t)
  ) {
    return "fixed_pay_question";
  }

  // Hourly / rate-per-hour (before generic how_much)
  if (
    /\ba como la hora\b/.test(t) ||
    /\bcuanto es la hora\b/.test(t) ||
    /\bcuanto pagan la hora\b/.test(t) ||
    /\bcuanto (pagan|es) por hora\b/.test(t) ||
    /\bpagan por hora\b/.test(t) ||
    /\bes por hora\b/.test(t) ||
    /\btrabajo por hora\b/.test(t) ||
    /\bhow much per hour\b/.test(t) ||
    /\bwhat'?s the hourly rate\b/.test(t) ||
    /\bwhats the hourly rate\b/.test(t) ||
    /\bwhat is the hourly rate\b/.test(t) ||
    /\bis it hourly\b/.test(t) ||
    /\bis this hourly\b/.test(t) ||
    /\bdo (you|they) pay (by the )?hour\b/.test(t)
  ) {
    return "hourly_pay_question";
  }

  // Salary / sueldo questions
  if (
    /\bes por salario\b/.test(t) ||
    /\bes salario\b/.test(t) ||
    /\bhay salario\b/.test(t) ||
    /\btiene salario\b/.test(t) ||
    /\btengo salario\b/.test(t) ||
    /\bes sueldo\b/.test(t) ||
    /\bhay sueldo\b/.test(t) ||
    /\bcuanto es el sueldo\b/.test(t) ||
    /\bcuanto es el salario\b/.test(t) ||
    /\bis it salary\b/.test(t) ||
    /\bis it a salary\b/.test(t) ||
    /\bis there a salary\b/.test(t) ||
    /\bis there a (fixed )?salary\b/.test(t) ||
    /\bwhat'?s the salary\b/.test(t) ||
    /\bwhats the salary\b/.test(t) ||
    /\bwhat is the salary\b/.test(t) ||
    /\bdoes it (have|pay) (a )?salary\b/.test(t)
  ) {
    return "salary_question";
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
