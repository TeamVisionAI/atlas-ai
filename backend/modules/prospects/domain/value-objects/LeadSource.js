/**
 * Sprint 14.1 — Lead source value object.
 */

const { LEAD_SOURCE_TYPES } = require("../constants");
const { ProspectDomainError } = require("../errors/ProspectDomainError");

class LeadSource {
  /**
   * @param {Object} props
   * @param {string} props.sourceType
   * @param {string|null} [props.sourceDetail]
   * @param {string|null} [props.sourceConnectorId]
   * @param {string} props.acquiredAt
   */
  constructor({ sourceType, sourceDetail, sourceConnectorId, acquiredAt }) {
    this.sourceType = sourceType;
    this.sourceDetail = sourceDetail;
    this.sourceConnectorId = sourceConnectorId;
    this.acquiredAt = acquiredAt;
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
      acquiredAt: this.acquiredAt
    };
  }
}

module.exports = {
  LeadSource
};
