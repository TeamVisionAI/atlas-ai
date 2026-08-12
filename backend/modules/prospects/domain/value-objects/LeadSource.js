/**
 * Sprint 14.1 — Lead source value object.
 * Phase 2: preserves QR attribution extensions on lead_source JSONB (BR-129 / BR-130).
 */

const { LEAD_SOURCE_TYPES } = require("../constants");
const { ProspectDomainError } = require("../errors/ProspectDomainError");

const CORE_KEYS = new Set([
  "sourceType",
  "sourceDetail",
  "sourceConnectorId",
  "acquiredAt"
]);

class LeadSource {
  /**
   * @param {Object} props
   */
  constructor(props = {}) {
    this.sourceType = props.sourceType;
    this.sourceDetail = props.sourceDetail ?? null;
    this.sourceConnectorId = props.sourceConnectorId ?? null;
    this.acquiredAt = props.acquiredAt;
    this.extensions = {};

    for (const [key, value] of Object.entries(props)) {
      if (!CORE_KEYS.has(key) && value !== undefined) {
        this.extensions[key] = value;
      }
    }
  }

  /**
   * @param {Object} [input]
   * @returns {LeadSource}
   */
  static create(input = {}) {
    const sourceType = input.sourceType || "manual";

    if (!LEAD_SOURCE_TYPES.includes(sourceType)) {
      throw new ProspectDomainError(`Invalid lead source type: ${sourceType}`, {
        publicCode: "INVALID_LEAD_SOURCE"
      });
    }

    return new LeadSource({
      ...input,
      sourceType,
      sourceDetail: input.sourceDetail || null,
      sourceConnectorId: input.sourceConnectorId || null,
      acquiredAt: input.acquiredAt || new Date().toISOString()
    });
  }

  toJSON() {
    return {
      sourceType: this.sourceType,
      sourceDetail: this.sourceDetail,
      sourceConnectorId: this.sourceConnectorId,
      acquiredAt: this.acquiredAt,
      ...this.extensions
    };
  }
}

module.exports = {
  LeadSource
};
