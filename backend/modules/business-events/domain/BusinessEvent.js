/**
 * Sprint 14.2 — BusinessEvent aggregate (immutable after creation).
 * Implements BUSINESS_EVENTS.md envelope schema.
 */

const crypto = require("crypto");
const { BusinessEventDomainError } = require("./errors/BusinessEventDomainError");
const { EventMetadata } = require("./EventMetadata");
const { isKnownEventType, requiresProspectId } = require("./EventTypes");
const { normalizeForCreate, assertReadableVersion } = require("./EventVersion");

class BusinessEvent {
  /**
   * @param {Object} props
   */
  constructor(props) {
    this._eventId = props.eventId;
    this._eventType = props.eventType;
    this._timestamp = props.timestamp;
    this._prospectId = props.prospectId;
    this._actor = props.actor;
    this._channel = props.channel;
    this._payload = Object.freeze({ ...(props.payload || {}) });
    this._version = props.version;
    this._correlationId = props.correlationId;
    this._causationId = props.causationId;
    this._metadata = props.metadata;
    this._createdAt = props.createdAt;
    Object.freeze(this);
  }

  /**
   * Internal factory — use EventFactory for all new events.
   * @param {Object} input
   * @returns {BusinessEvent}
   */
  static create(input) {
    if (!input?.eventType || typeof input.eventType !== "string") {
      throw new BusinessEventDomainError("eventType is required.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    if (!isKnownEventType(input.eventType)) {
      throw new BusinessEventDomainError(`Unknown event type: ${input.eventType}`, {
        publicCode: "INVALID_EVENT_TYPE"
      });
    }

    if (!input.actor) {
      throw new BusinessEventDomainError("actor is required.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    if (requiresProspectId(input.eventType) && !input.prospectId) {
      throw new BusinessEventDomainError(
        `prospectId is required for event type ${input.eventType}.`,
        { publicCode: "VALIDATION_ERROR" }
      );
    }

    if (input.payload != null && (typeof input.payload !== "object" || Array.isArray(input.payload))) {
      throw new BusinessEventDomainError("payload must be an object.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    const now = new Date().toISOString();

    return new BusinessEvent({
      eventId: input.eventId || crypto.randomUUID(),
      eventType: input.eventType,
      timestamp: input.timestamp || now,
      prospectId: input.prospectId ?? null,
      actor: input.actor,
      channel: input.channel ?? null,
      payload: input.payload || {},
      version: normalizeForCreate(input.version),
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      metadata: EventMetadata.create(input.metadata || {}),
      createdAt: input.createdAt || now
    });
  }

  /**
   * @param {Object} props
   * @returns {BusinessEvent}
   */
  static reconstitute(props) {
    return new BusinessEvent({
      eventId: props.eventId,
      eventType: props.eventType,
      timestamp: props.timestamp,
      prospectId: props.prospectId,
      actor: props.actor,
      channel: props.channel,
      payload: props.payload || {},
      version: assertReadableVersion(props.version),
      correlationId: props.correlationId,
      causationId: props.causationId,
      metadata: EventMetadata.create(props.metadata || {}),
      createdAt: props.createdAt
    });
  }

  get eventId() {
    return this._eventId;
  }

  get eventType() {
    return this._eventType;
  }

  get timestamp() {
    return this._timestamp;
  }

  get prospectId() {
    return this._prospectId;
  }

  get actor() {
    return this._actor;
  }

  get channel() {
    return this._channel;
  }

  get payload() {
    return this._payload;
  }

  get version() {
    return this._version;
  }

  get correlationId() {
    return this._correlationId;
  }

  get causationId() {
    return this._causationId;
  }

  get metadata() {
    return this._metadata;
  }

  get createdAt() {
    return this._createdAt;
  }

  toJSON() {
    return {
      eventId: this._eventId,
      eventType: this._eventType,
      timestamp: this._timestamp,
      prospectId: this._prospectId,
      actor: this._actor,
      channel: this._channel,
      payload: this._payload,
      version: this._version,
      correlationId: this._correlationId,
      causationId: this._causationId,
      metadata: this._metadata.toJSON(),
      createdAt: this._createdAt
    };
  }
}

module.exports = {
  BusinessEvent
};
