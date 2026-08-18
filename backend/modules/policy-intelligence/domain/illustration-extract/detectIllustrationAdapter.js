/**
 * Carrier illustration adapter routing (BR-060).
 * Identity only — does not parse ledgers.
 */

const ADAPTER_KEYS = Object.freeze({
  LSW_FLEXLIFE_II_20417FL: "lsw-flexlife-ii-20417FL",
  NATIONWIDE_IUL: "nationwide-iul"
});

function joinedText(pages = []) {
  return (pages || []).map((page) => String(page?.text || "")).join("\n");
}

/**
 * Route by issuer / product / base form. Unknown documents keep the
 * existing Nationwide-shaped parser (current production default).
 */
function detectIllustrationAdapter(pages = []) {
  const text = joinedText(pages);
  const hasForm = /20417FL/i.test(text);
  const hasIssuer = /life insurance company of the southwest/i.test(text);
  const hasProduct = /flexlife\s*ii/i.test(text);

  if (hasForm && (hasIssuer || hasProduct)) {
    return ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL;
  }

  return ADAPTER_KEYS.NATIONWIDE_IUL;
}

module.exports = {
  ADAPTER_KEYS,
  detectIllustrationAdapter
};
