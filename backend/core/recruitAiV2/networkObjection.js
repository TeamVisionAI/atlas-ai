/**
 * Recruit AI v2 — network / prospecting objection recognition (BR-103).
 * Must outrank generic clarify while scheduling is pending.
 */

function normalizeNetworkText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeNetworkObjection(text) {
  const t = normalizeNetworkText(text);
  if (!t) {
    return false;
  }

  return (
    /\bno conozco a nadie\b/.test(t) ||
    /\bno conozco nadie\b/.test(t) ||
    /\bno conozco mucha gente\b/.test(t) ||
    /\bno tengo contactos\b/.test(t) ||
    /\bno tengo a quien llamar\b/.test(t) ||
    /\bno tengo clientes\b/.test(t) ||
    /\bno tengo personas para hablar\b/.test(t) ||
    /\bno tengo mercado\b/.test(t) ||
    /\ba quien le voy a vender\b/.test(t) ||
    /\bi don'?t know anyone\b/.test(t) ||
    /\bi do not know anyone\b/.test(t) ||
    /\bi don'?t know anybody\b/.test(t) ||
    /\bi do not know anybody\b/.test(t) ||
    /\bi don'?t have contacts\b/.test(t) ||
    /\bi do not have contacts\b/.test(t) ||
    /\bi don'?t have anyone to call\b/.test(t) ||
    /\bi do not have anyone to call\b/.test(t) ||
    /\bi don'?t have clients\b/.test(t) ||
    /\bi do not have clients\b/.test(t) ||
    /\bi don'?t know many people\b/.test(t) ||
    /\bi do not know many people\b/.test(t) ||
    /\bwho am i supposed to talk to\b/.test(t) ||
    /\bi don'?t have a network\b/.test(t) ||
    /\bi do not have a network\b/.test(t)
  );
}

module.exports = {
  normalizeNetworkText,
  looksLikeNetworkObjection
};
