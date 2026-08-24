/**
 * BR-143 C — original reason for purchasing the policy (discovery fact C).
 * Canonical category when clear; never invent when unclear. Preserve raw NL.
 */

"use strict";

const ORIGINAL_POLICY_PURPOSE = Object.freeze({
  FAMILY_PROTECTION: "FAMILY_PROTECTION",
  CASH_ACCUMULATION: "CASH_ACCUMULATION",
  RETIREMENT: "RETIREMENT",
  CHILD_EDUCATION: "CHILD_EDUCATION",
  LEGACY_INHERITANCE: "LEGACY_INHERITANCE",
  MORTGAGE_DEBT_PROTECTION: "MORTGAGE_DEBT_PROTECTION",
  TAX_BENEFITS: "TAX_BENEFITS",
  AGENT_RECOMMENDATION: "AGENT_RECOMMENDATION",
  UNSURE: "UNSURE",
  OTHER: "OTHER"
});

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulRaw(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  if (raw.length < 8 && /^(si|yes|ok|claro|no)$/i.test(raw)) {
    return null;
  }
  return raw.slice(0, 280);
}

function classifyOriginalPolicyPurpose(text) {
  const t = fold(text);
  const raw = usefulRaw(text);

  if (!t) {
    return { category: null, raw: null, forced: false };
  }

  if (
    /^(no se|nose|no lo se|no estoy seguro|no estoy segura|no tengo idea|unsure|not sure|i don'?t know|idk|no idea)$/.test(
      t
    ) ||
    /\bno (lo )?se\b/.test(t) ||
    /\bno estoy segur[oa]\b/.test(t) ||
    /\bnot sure\b/.test(t) ||
    /\bi don'?t (really )?know\b/.test(t)
  ) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.UNSURE,
      raw,
      forced: false
    };
  }

  if (
    /\b(proteger (a )?(mi |la )?familia|proteccion (de |para )?(la )?familia|family protection|protect(ing)? (my |the )?family|para (mi |la )?familia|beneficio por muerte|death benefit)\b/.test(
      t
    )
  ) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.FAMILY_PROTECTION,
      raw,
      forced: false
    };
  }

  if (
    /\b(valor (en )?efectivo|cash value|acumulacion|ahorrar|ahorro|crecer el dinero|build(ing)? cash|cash accumulation)\b/.test(
      t
    )
  ) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.CASH_ACCUMULATION,
      raw,
      forced: false
    };
  }

  if (/\b(retiro|jubilacion|retirement|retire|pension)\b/.test(t)) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.RETIREMENT,
      raw,
      forced: false
    };
  }

  if (
    /\b(educacion (de )?(los |mis )?hijos|college|universidad|child(ren)?('?s)? education|para (mis |los )?hijos)\b/.test(
      t
    )
  ) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.CHILD_EDUCATION,
      raw,
      forced: false
    };
  }

  if (
    /\b(legado|herencia|legacy|inheritance|dejar(les)? (algo|dinero)|para (mis )?herederos)\b/.test(
      t
    )
  ) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.LEGACY_INHERITANCE,
      raw,
      forced: false
    };
  }

  if (/\b(hipoteca|mortgage|deuda|debt|pagar la casa|home loan)\b/.test(t)) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.MORTGAGE_DEBT_PROTECTION,
      raw,
      forced: false
    };
  }

  if (/\b(impuestos?|tax(es)?|beneficios? fiscales?|tax benefit)\b/.test(t)) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.TAX_BENEFITS,
      raw,
      forced: false
    };
  }

  if (
    /\b(me (lo )?recomendo (el |mi )?agente|el agente (me )?(dijo|recomendo)|agent recommend|my agent (told|said|recommended)|porque (me )?(lo )?dijeron)\b/.test(
      t
    )
  ) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.AGENT_RECOMMENDATION,
      raw,
      forced: false
    };
  }

  if (t.length >= 12 || /\b(porque|para|por|because|for)\b/.test(t)) {
    return {
      category: ORIGINAL_POLICY_PURPOSE.OTHER,
      raw: raw || t.slice(0, 280),
      forced: false
    };
  }

  return { category: null, raw, forced: false };
}

module.exports = {
  ORIGINAL_POLICY_PURPOSE,
  classifyOriginalPolicyPurpose
};
