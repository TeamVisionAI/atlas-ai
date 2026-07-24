/**
 * Sprint 14.2 — Optional Business Event metadata envelope.
 */

const DEFAULT_ORGANIZATION_ID =
  process.env.ATLAS_DEFAULT_ORGANIZATION_ID || "00000000-0000-4000-8000-000000000001";

class EventMetadata {
  /**
   * @param {Object} [props]
   */
  constructor(props = {}) {
    this.organizationId = props.organizationId || DEFAULT_ORGANIZATION_ID;
    this.lifecycleStateAtEvent = props.lifecycleStateAtEvent ?? null;
    this.summary = props.summary ?? null;
    this.parentEventId = props.parentEventId ?? null;
    this.permissionContext = props.permissionContext ?? null;
  }

  /**
   * @param {Object} [input]
   * @returns {EventMetadata}
   */
  static create(input = {}) {
    return new EventMetadata(input);
  }

  toJSON() {
    return {
      organizationId: this.organizationId,
      lifecycleStateAtEvent: this.lifecycleStateAtEvent,
      summary: this.summary,
      parentEventId: this.parentEventId,
      permissionContext: this.permissionContext
    };
  }
}

module.exports = {
  EventMetadata,
  DEFAULT_ORGANIZATION_ID
};
