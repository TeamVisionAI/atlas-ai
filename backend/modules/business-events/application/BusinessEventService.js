/**
 * Sprint 14.2 — Business Event application service.
 * Validates, persists, and publishes events — does not know consumers.
 */

const { BusinessEvent } = require("../domain/BusinessEvent");
const { BusinessEventDomainError } = require("../domain/errors/BusinessEventDomainError");
const { SupabaseBusinessEventRepository } = require("../infrastructure/persistence/SupabaseBusinessEventRepository");
const { InProcessEventPublisher } = require("./InProcessEventPublisher");
const { EventFactory } = require("./EventFactory");

function assertTenantOrganizationId(organizationId) {
  if (!organizationId) {
    throw new BusinessEventDomainError(
      "organizationId is required for tenant-scoped business event access.",
      { statusCode: 400, publicCode: "TENANT_ORGANIZATION_REQUIRED" }
    );
  }

  return organizationId;
}

function toApplicationError(error) {
  if (error instanceof BusinessEventDomainError || error.statusCode) {
    return error;
  }

  const wrapped = new Error(error.message || "Unexpected business event error.");
  wrapped.statusCode = 500;
  wrapped.publicCode = "BUSINESS_EVENT_ERROR";
  return wrapped;
}

class BusinessEventService {
  /**
   * @param {Object} [deps]
   * @param {SupabaseBusinessEventRepository} [deps.repository]
   * @param {InProcessEventPublisher} [deps.publisher]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new SupabaseBusinessEventRepository();
    this.publisher = deps.publisher || new InProcessEventPublisher();
  }

  getPublisher() {
    return this.publisher;
  }

  /**
   * Record a new immutable Business Event.
   * @param {BusinessEvent|Object} eventOrInput — prefer EventFactory-built BusinessEvent
   * @returns {Promise<BusinessEvent>}
   */
  async record(eventOrInput) {
    try {
      const event =
        eventOrInput instanceof BusinessEvent
          ? eventOrInput
          : EventFactory.create(eventOrInput);

      const persisted = await this.repository.append(event);
      await this.publisher.publish(persisted);
      return persisted;
    } catch (error) {
      throw toApplicationError(error);
    }
  }

  async getById(eventId, organizationId) {
    assertTenantOrganizationId(organizationId);
    const event = await this.repository.findById(eventId, organizationId);

    if (!event) {
      throw new BusinessEventDomainError("Business event not found.", {
        statusCode: 404,
        publicCode: "EVENT_NOT_FOUND"
      });
    }

    return event.toJSON();
  }

  async list(filters = {}) {
    const result = await this.repository.search(filters);

    return {
      items: result.items.map((event) => event.toJSON()),
      total: result.total
    };
  }

  async listByProspect(prospectId, organizationId, filters = {}) {
    assertTenantOrganizationId(organizationId);
    const result = await this.repository.findByProspect(prospectId, organizationId, filters);

    return {
      items: result.items.map((event) => event.toJSON()),
      total: result.total
    };
  }

  async listByType(eventType, filters = {}) {
    const result = await this.repository.findByType(eventType, filters);

    return {
      items: result.items.map((event) => event.toJSON()),
      total: result.total
    };
  }

  async listByCorrelationId(correlationId, filters = {}) {
    const result = await this.repository.findByCorrelationId(correlationId, filters);

    return {
      items: result.items.map((event) => event.toJSON()),
      total: result.total
    };
  }

  async listBetweenDates(from, to, filters = {}) {
    const result = await this.repository.findBetweenDates(from, to, filters);

    return {
      items: result.items.map((event) => event.toJSON()),
      total: result.total
    };
  }
}

module.exports = {
  BusinessEventService
};
