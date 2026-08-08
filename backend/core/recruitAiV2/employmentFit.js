/**
 * Recruit AI v2 — employment-fit preference (BR-090).
 * Distinguishes fixed-employment preference from compensation FAQ, withdraw, and opt-out.
 */

function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Explicit Puerto Rico origin / citizenship statements (conservative).
 * Not generic Caribbean / Latino / geographic phrases.
 */
function looksLikePuertoRicoOriginStatement(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\b(si[, ]*)?(soy|somos) de (pr|puerto rico)\b/.test(t) ||
    /\bnaci en (pr|puerto rico)\b/.test(t) ||
    /\bsoy puertorriquen[oa]\b/.test(t) ||
    /\bi('?m| am) from (pr|puerto rico)\b/.test(t) ||
    /\bi('?m| am) (from )?puerto rico\b/.test(t) ||
    /\bborn in puerto rico\b/.test(t) ||
    /\bi('?m| am) puerto rican\b/.test(t)
  );
}

/**
 * Seeking / preferring fixed salary, hourly, or traditional W-2 style employment.
 * Not a compensation FAQ question and not withdraw/opt-out.
 */
function looksLikeFixedEmploymentPreference(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  // Compensation / pay questions stay on the FAQ path (BR-104).
  if (
    /\b(esto paga|cuanto (pagan|se gana|gano|puedo ganar|es la hora|es el sueldo|es el salario)|a como la hora|como (voy a )?ganar|como se gana|como pagan|como me pagan|como me van a pagar|como es el pago|como funciona el pago|como recibo el pago|de que forma pagan|cual es la forma de pago|hay (salario|sueldo)|es (por )?(salario|sueldo|comision|hora)|es pago fijo|el pago es fijo|pagan fijo|es sueldo fijo|how much( per hour)?|hourly rate|how do (i|they|you) (make money|get paid|pay)|how does payment work|pay structure|does it pay|is there a salary|is it (commission|hourly|salary|fixed pay)|is the pay fixed|what'?s the salary)\b/.test(
      t
    )
  ) {
    return false;
  }

  return (
    /\bestoy buscando (empleo|trabajo) fijo\b/.test(t) ||
    /\bbusco (un )?(empleo|trabajo) fijo\b/.test(t) ||
    /\bquiero (un )?(sueldo|salario) fijo\b/.test(t) ||
    /\bestoy buscando (sueldo|salario) fijo\b/.test(t) ||
    /\bsolo busco (empleo|trabajo) con sueldo\b/.test(t) ||
    /\bbusco algo estable con sueldo\b/.test(t) ||
    /\bprefiero (un )?trabajo por hora o salario\b/.test(t) ||
    /\bi('?m| am) looking for a salaried job\b/.test(t) ||
    /\bi('?m| am) looking for fixed employment\b/.test(t) ||
    /\bi want a steady paycheck\b/.test(t) ||
    /\bi('?m| am) looking for an hourly job\b/.test(t) ||
    /\bi only want a salary position\b/.test(t) ||
    /\bi('?m| am) looking for traditional employment\b/.test(t)
  );
}

/**
 * Reinforced "right now I need a (regular) job" after opportunity / preference explained.
 */
function looksLikeCurrentJobSearchFocus(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\bpor el momento mi enfoque es encontrar (trabajo|empleo)\b/.test(t) ||
    /\bmi enfoque (ahora |por ahora |por el momento )?es encontrar (trabajo|empleo)\b/.test(
      t
    ) ||
    /\bahora (mismo )?mi enfoque es encontrar (trabajo|empleo)\b/.test(t) ||
    /\bright now i('?m| am) (just )?looking for (a )?(job|work|employment)\b/.test(
      t
    ) ||
    /\bmy focus (right now |for now )?is finding (a )?(job|work)\b/.test(t) ||
    /\bfor now i('?m| am) focused on finding (a )?(job|work)\b/.test(t)
  );
}

function hasEmploymentFitContext(context = {}) {
  const facts = context.knownFacts || {};
  const conversation = context.conversation || {};
  return (
    facts.employmentPreference === "fixed" ||
    facts.currentFit === "not_now" ||
    conversation.fixedEmploymentAcknowledged === true ||
    conversation.opportunityExplained === true
  );
}

module.exports = {
  looksLikePuertoRicoOriginStatement,
  looksLikeFixedEmploymentPreference,
  looksLikeCurrentJobSearchFocus,
  hasEmploymentFitContext
};
