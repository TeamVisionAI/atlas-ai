/**
 * Sprint 14.1 — Email value object.
 */

const { ProspectDomainError } = require("../errors/ProspectDomainError");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class EmailAddress {
  /**
   * @param {string} value
   */
  constructor(value) {
    this.value = value;
  }

  /**
   * @param {string|null|undefined} value
   * @param {Object} [options]
   * @param {boolean} [options.required]
   * @param {string} [options.field]
   * @returns {EmailAddress|null}
   */
  static create(value, { required = false, field = "email" } = {}) {
    if (value == null || value === "") {
      if (required) {
        throw new ProspectDomainError(`${field} is required.`, {
          publicCode: "VALIDATION_ERROR"
        });
      }

      return null;
    }

    const normalized = String(value).trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalized)) {
      throw new ProspectDomainError(`Invalid ${field} format.`, {
        publicCode: "INVALID_EMAIL"
      });
    }

    return new EmailAddress(normalized);
  }

  toString() {
    return this.value;
  }
}

module.exports = {
  EmailAddress
};
