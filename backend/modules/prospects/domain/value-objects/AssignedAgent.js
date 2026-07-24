/**
 * Sprint 14.1 — Agent assignment value object.
 */

class AssignedAgent {
  /**
   * @param {Object|null} props
   */
  constructor(props = null) {
    this.assignedAgentId = props?.assignedAgentId ?? null;
    this.assignedAt = props?.assignedAt ?? null;
    this.assignedBy = props?.assignedBy ?? null;
    this.assignmentReason = props?.assignmentReason ?? null;
  }

  /**
   * @param {Object} input
   * @param {string} actor
   * @returns {AssignedAgent}
   */
  static assign(input, actor = "SYSTEM") {
    if (!input?.assignedAgentId) {
      const { ProspectDomainError } = require("../errors/ProspectDomainError");
      throw new ProspectDomainError("assignedAgentId is required.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    return new AssignedAgent({
      assignedAgentId: input.assignedAgentId,
      assignedAt: new Date().toISOString(),
      assignedBy: input.assignedBy || actor,
      assignmentReason: input.assignmentReason || null
    });
  }

  toJSON() {
    return {
      assignedAgentId: this.assignedAgentId,
      assignedAt: this.assignedAt,
      assignedBy: this.assignedBy,
      assignmentReason: this.assignmentReason
    };
  }
}

module.exports = {
  AssignedAgent
};
