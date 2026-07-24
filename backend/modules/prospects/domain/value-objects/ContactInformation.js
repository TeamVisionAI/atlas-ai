/**
 * Sprint 14.1 — Contact information value object.
 */

const { EmailAddress } = require("./EmailAddress");
const { PhoneNumber } = require("./PhoneNumber");
const { ProspectDomainError } = require("../errors/ProspectDomainError");

class ContactInformation {
  /**
   * @param {Object} props
   */
  constructor(props) {
    this.primaryPhone = props.primaryPhone;
    this.secondaryPhone = props.secondaryPhone;
    this.normalizedPrimaryPhone = props.normalizedPrimaryPhone;
    this.email = props.email;
    this.secondaryEmail = props.secondaryEmail;
    this.preferredLanguage = props.preferredLanguage || "es";
    this.timezone = props.timezone;
    this.address = props.address || {};
  }

  /**
   * @param {Object} input
   * @returns {ContactInformation}
   */
  static create(input = {}) {
    const email = EmailAddress.create(input.email, { field: "email" });
    const secondaryEmail = EmailAddress.create(input.secondaryEmail, {
      field: "secondaryEmail"
    });
    const phone = PhoneNumber.create(input.primaryPhone);

    ContactInformation.assertReachable({
      displayName: input.displayName,
      email,
      phone
    });

    return new ContactInformation({
      primaryPhone: input.primaryPhone ? String(input.primaryPhone).trim() : null,
      secondaryPhone: input.secondaryPhone ?? null,
      normalizedPrimaryPhone: phone ? phone.toString() : null,
      email: email ? email.toString() : null,
      secondaryEmail: secondaryEmail ? secondaryEmail.toString() : null,
      preferredLanguage: input.preferredLanguage || "es",
      timezone: input.timezone ?? null,
      address: input.address || {}
    });
  }

  /**
   * @param {Object} params
   * @param {string|null} params.displayName
   * @param {EmailAddress|null} params.email
   * @param {PhoneNumber|null} params.phone
   */
  static assertReachable({ displayName, email, phone }) {
    if (!displayName && !email && !phone) {
      throw new ProspectDomainError(
        "At least one of displayName, email, or primaryPhone is required.",
        { publicCode: "VALIDATION_ERROR" }
      );
    }
  }

  /**
   * @param {Object} patch
   * @param {string|null} displayName
   * @returns {ContactInformation}
   */
  withPatch(patch, displayName) {
    const nextEmail =
      patch.email !== undefined
        ? EmailAddress.create(patch.email, { field: "email" })
        : EmailAddress.create(this.email);

    const nextPhone =
      patch.primaryPhone !== undefined
        ? PhoneNumber.create(patch.primaryPhone)
        : PhoneNumber.create(this.primaryPhone);

    ContactInformation.assertReachable({
      displayName: patch.displayName ?? displayName,
      email: nextEmail,
      phone: nextPhone
    });

    return new ContactInformation({
      primaryPhone:
        patch.primaryPhone !== undefined
          ? patch.primaryPhone
          : this.primaryPhone,
      secondaryPhone:
        patch.secondaryPhone !== undefined
          ? patch.secondaryPhone
          : this.secondaryPhone,
      normalizedPrimaryPhone: nextPhone ? nextPhone.toString() : null,
      email: nextEmail ? nextEmail.toString() : null,
      secondaryEmail:
        patch.secondaryEmail !== undefined
          ? EmailAddress.create(patch.secondaryEmail, { field: "secondaryEmail" })?.toString() ??
            null
          : this.secondaryEmail,
      preferredLanguage:
        patch.preferredLanguage !== undefined
          ? patch.preferredLanguage
          : this.preferredLanguage,
      timezone: patch.timezone !== undefined ? patch.timezone : this.timezone,
      address: patch.address !== undefined ? patch.address : this.address
    });
  }

  toJSON() {
    return {
      primaryPhone: this.primaryPhone,
      secondaryPhone: this.secondaryPhone,
      normalizedPrimaryPhone: this.normalizedPrimaryPhone,
      email: this.email,
      secondaryEmail: this.secondaryEmail,
      preferredLanguage: this.preferredLanguage,
      timezone: this.timezone,
      address: this.address
    };
  }
}

module.exports = {
  ContactInformation
};
