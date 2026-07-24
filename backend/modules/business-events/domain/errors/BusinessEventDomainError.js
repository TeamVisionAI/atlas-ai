/**
 * Sprint 14.2 — Business Event domain errors.
 */

class BusinessEventDomainError extends Error {
  constructor(message, { statusCode = 400, publicCode = "BUSINESS_EVENT_ERROR" } = {}) {
    super(message);
    this.name = "BusinessEventDomainError";
    this.statusCode = statusCode;
    this.publicCode = publicCode;
  }
}

module.exports = {
  BusinessEventDomainError
};
