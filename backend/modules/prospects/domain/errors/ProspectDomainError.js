/**
 * Sprint 14.1 — Domain errors for the Prospect bounded context.
 */

class ProspectDomainError extends Error {
  /**
   * @param {string} message
   * @param {Object} [options]
   * @param {number} [options.statusCode]
   * @param {string} [options.publicCode]
   */
  constructor(message, { statusCode = 400, publicCode = "DOMAIN_ERROR" } = {}) {
    super(message);
    this.name = "ProspectDomainError";
    this.statusCode = statusCode;
    this.publicCode = publicCode;
  }
}

module.exports = {
  ProspectDomainError
};
