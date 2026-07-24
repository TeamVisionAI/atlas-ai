/**
 * Sprint 14.3 — Timeline entry domain object (immutable projection).
 */

const crypto = require("crypto");
const { mapBusinessEventToEntryType } = require("./TimelineEntryType");
const { DEFAULT_ORGANIZATION_ID } = require("../../business-events/domain/EventMetadata");

class TimelineDomainError extends Error {
  constructor(message, { statusCode = 400, publicCode = "TIMELINE_ERROR" } = {}) {
    super(message);
    this.name = "TimelineDomainError";
    this.statusCode = statusCode;
    this.publicCode = publicCode;
  }
}

class TimelineEntry {
  constructor(props) {
    this._entryId = props.entryId;
    this._prospectId = props.prospectId;
    this._businessEventId = props.businessEventId;
    this._entryType = props.entryType;
    this._eventType = props.eventType;
    this._timestamp = props.timestamp;
    this._actor = props.actor;
    this._channel = props.channel;
    this._summary = props.summary;
    this._payload = Object.freeze({ ...(props.payload || {}) });
    this._lifecycleStateAtEvent = props.lifecycleStateAtEvent;
    this._correlationId = props.correlationId;
    this._organizationId = props.organizationId;
    this._createdAt = props.createdAt;
    Object.freeze(this);
  }

  /**
   * @param {Object} input
   * @returns {TimelineEntry}
   */
  static create(input) {
    if (!input.prospectId) {
      throw new TimelineDomainError("prospectId is required for timeline entries.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    if (!input.businessEventId) {
      throw new TimelineDomainError("businessEventId is required.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    if (!input.eventType) {
      throw new TimelineDomainError("eventType is required.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    const now = new Date().toISOString();

    return new TimelineEntry({
      entryId: input.entryId || input.businessEventId || crypto.randomUUID(),
      prospectId: input.prospectId,
      businessEventId: input.businessEventId,
      entryType: input.entryType || mapBusinessEventToEntryType(input.eventType),
      eventType: input.eventType,
      timestamp: input.timestamp || now,
      actor: input.actor || "SYSTEM",
      channel: input.channel ?? null,
      summary: input.summary || input.eventType,
      payload: input.payload || {},
      lifecycleStateAtEvent: input.lifecycleStateAtEvent ?? null,
      correlationId: input.correlationId ?? null,
      organizationId: input.organizationId || DEFAULT_ORGANIZATION_ID,
      createdAt: input.createdAt || now
    });
  }

  /**
   * Project a published Business Event envelope into a TimelineEntry.
   * @param {Object} businessEvent — BusinessEvent.toJSON() shape
   * @returns {TimelineEntry|null}
   */
  static fromBusinessEvent(businessEvent) {
    if (!businessEvent?.prospectId) {
      return null;
    }

    return TimelineEntry.create({
      entryId: businessEvent.eventId,
      businessEventId: businessEvent.eventId,
      prospectId: businessEvent.prospectId,
      eventType: businessEvent.eventType,
      entryType: mapBusinessEventToEntryType(businessEvent.eventType),
      timestamp: businessEvent.timestamp,
      actor: businessEvent.actor,
      channel: businessEvent.channel,
      summary: businessEvent.metadata?.summary || businessEvent.eventType,
      payload: businessEvent.payload || {},
      lifecycleStateAtEvent: businessEvent.metadata?.lifecycleStateAtEvent ?? null,
      correlationId: businessEvent.correlationId ?? null,
      organizationId: businessEvent.metadata?.organizationId,
      createdAt: businessEvent.createdAt || businessEvent.timestamp
    });
  }

  static reconstitute(props) {
    return new TimelineEntry(props);
  }

  toJSON() {
    return {
      entryId: this._entryId,
      prospectId: this._prospectId,
      businessEventId: this._businessEventId,
      entryType: this._entryType,
      eventType: this._eventType,
      timestamp: this._timestamp,
      actor: this._actor,
      channel: this._channel,
      summary: this._summary,
      payload: this._payload,
      lifecycleStateAtEvent: this._lifecycleStateAtEvent,
      correlationId: this._correlationId,
      organizationId: this._organizationId,
      createdAt: this._createdAt
    };
  }
}

module.exports = {
  TimelineEntry,
  TimelineDomainError
};
