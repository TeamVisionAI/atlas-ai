/**
 * PII sanitization for Policy Intelligence boundaries (BR-054).
 * Used before Knowledge Center index/embed, shared reports, and research exports.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE =
  /(?<!\w)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?!\w)/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const POLICY_ID_RE =
  /\b(?:policy(?:\s*(?:number|no\.?|#|id))?[\s:_-]*)([A-Z0-9-]{5,})\b/gi;
const STREET_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'\-\s]{2,40}\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\b/gi;
const PERSON_NAME_RE =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;

function sanitizePiiText(input) {
  if (input === null || input === undefined) {
    return "";
  }

  let text = String(input);

  text = text.replace(EMAIL_RE, "[EMAIL]");
  text = text.replace(SSN_RE, "[TAX_ID]");
  text = text.replace(PHONE_RE, "[PHONE]");
  text = text.replace(POLICY_ID_RE, "[POLICY_ID]");
  text = text.replace(STREET_RE, "[ADDRESS]");

  // Conservative proper-name masking for free text (Knowledge / shared surfaces).
  text = text.replace(PERSON_NAME_RE, (match) => {
    const blocked = new Set([
      "Preferred",
      "Non",
      "Smoker",
      "Plus",
      "Male",
      "Female",
      "Term",
      "Life",
      "Universal",
      "Whole",
      "Indexed",
      "Variable",
      "Monthly",
      "Annual",
      "Quarterly",
      "Insurance",
      "Policy",
      "Carrier",
      "Product",
      "Premium",
      "Coverage",
      "Rider",
      "Index",
      "Cash",
      "Value",
      "Face",
      "Amount",
      "Issue",
      "Age",
      "Tobacco",
      "Underwriting",
      "Class",
      "Gender",
      "Atlas",
      "Extract",
      "Intelligence"
    ]);

    const parts = match.split(/\s+/);
    if (parts.every((part) => blocked.has(part))) {
      return match;
    }

    return "[REDACTED]";
  });

  return text;
}

/**
 * Prepare content for Knowledge Center index / embed / benchmark ingest.
 * Always sanitizes; never passes CRM linkage IDs through.
 */
function prepareKnowledgeCenterPayload({
  title = "",
  body = "",
  metadata = {}
} = {}) {
  const safeMeta = {};

  for (const [key, value] of Object.entries(metadata || {})) {
    const lower = String(key).toLowerCase();
    if (
      lower.includes("prospect") ||
      lower.includes("email") ||
      lower.includes("phone") ||
      lower.includes("name") ||
      lower.includes("address") ||
      lower.includes("ssn") ||
      lower.includes("policynumber") ||
      lower.includes("userid") ||
      lower === "reviewid" ||
      lower === "organizationid"
    ) {
      continue;
    }

    if (typeof value === "string") {
      safeMeta[key] = sanitizePiiText(value);
    } else if (value !== null && typeof value !== "object") {
      safeMeta[key] = value;
    }
  }

  return {
    title: sanitizePiiText(title),
    body: sanitizePiiText(body),
    metadata: safeMeta,
    sanitized: true,
    boundary: "knowledge_center"
  };
}

module.exports = {
  sanitizePiiText,
  prepareKnowledgeCenterPayload
};
