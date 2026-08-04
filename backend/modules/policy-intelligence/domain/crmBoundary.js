/**
 * CRM ↔ Policy Intelligence boundary (BR-056).
 *
 * CRM owns people, policy numbers, and ownership identity.
 * Policy Intelligence owns policy mechanics and identifies reviews by reviewId only.
 */

const crypto = require("crypto");

/**
 * Hash a CRM policy number for optional reconciliation.
 * Plaintext policy numbers must never be persisted in Policy Intelligence.
 */
function hashCrmPolicyNumber(policyNumber, organizationId) {
  const value = String(policyNumber || "").trim();

  if (!value) {
    return null;
  }

  const org = String(organizationId || "unknown").trim();
  return crypto.createHash("sha256").update(`${org}:${value.toUpperCase()}`).digest("hex");
}

const CRM_EXPORT_FORBIDDEN_KEYS = Object.freeze([
  "prospectId",
  "prospect_id",
  "policyNumber",
  "policy_number",
  "ownerName",
  "insuredName",
  "beneficiaryName",
  "agentName",
  "clientName",
  "policyHolderName",
  "holderName"
]);

function assertNoCrmIdentityLeak(payload, contextLabel = "policy_intelligence") {
  const json = JSON.stringify(payload || {});

  for (const key of CRM_EXPORT_FORBIDDEN_KEYS) {
    if (json.includes(`"${key}"`)) {
      const error = new Error(
        `CRM boundary violation (${contextLabel}): forbidden identity key ${key}`
      );
      error.statusCode = 500;
      error.publicCode = "POLICY_CRM_BOUNDARY";
      throw error;
    }
  }

  return true;
}

module.exports = {
  hashCrmPolicyNumber,
  CRM_EXPORT_FORBIDDEN_KEYS,
  assertNoCrmIdentityLeak
};
