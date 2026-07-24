/**
 * Sprint 14.1 — Phone value object (E.164 normalization).
 */

class PhoneNumber {
  /**
   * @param {string} normalized
   */
  constructor(normalized) {
    this.normalized = normalized;
  }

  /**
   * @param {string|null|undefined} value
   * @returns {string|null}
   */
  static normalize(value) {
    if (value == null || value === "") {
      return null;
    }

    const digits = String(value).replace(/\D/g, "");

    if (!digits) {
      return null;
    }

    if (digits.length === 10) {
      return `+1${digits}`;
    }

    return `+${digits}`;
  }

  /**
   * @param {string|null|undefined} value
   * @returns {PhoneNumber|null}
   */
  static create(value) {
    const normalized = PhoneNumber.normalize(value);

    if (!normalized) {
      return null;
    }

    return new PhoneNumber(normalized);
  }

  /**
   * @param {PhoneNumber|null|undefined} other
   */
  equals(other) {
    return Boolean(other) && this.normalized === other.normalized;
  }

  toString() {
    return this.normalized;
  }
}

module.exports = {
  PhoneNumber
};
