/**
 * Sprint 14.1 — Application-layer input validation for update commands.
 */

const { OWNERSHIP_VALUES } = require("../../domain/constants");
const { EmailAddress } = require("../../domain/value-objects/EmailAddress");
const { LeadSource } = require("../../domain/value-objects/LeadSource");
const { CommunicationChannel } = require("../../domain/value-objects/CommunicationChannel");
const { ProspectStatus } = require("../../domain/value-objects/ProspectStatus");
const { ProspectDomainError } = require("../../domain/errors/ProspectDomainError");

function validateUpdateProspectInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProspectDomainError("Update payload must be an object.", {
      publicCode: "VALIDATION_ERROR"
    });
  }

  const patch = {};

  if (input.displayName !== undefined || input.identity?.displayName !== undefined) {
    patch.displayName = String(input.displayName ?? input.identity.displayName).trim();

    if (!patch.displayName) {
      throw new ProspectDomainError("displayName cannot be empty.", {
        publicCode: "VALIDATION_ERROR"
      });
    }
  }

  if (input.legalName !== undefined || input.identity?.legalName !== undefined) {
    patch.legalName = input.legalName ?? input.identity?.legalName;
  }

  if (input.primaryPhone !== undefined || input.contact?.primaryPhone !== undefined) {
    patch.primaryPhone = input.primaryPhone ?? input.contact?.primaryPhone;
  }

  if (input.secondaryPhone !== undefined || input.contact?.secondaryPhone !== undefined) {
    patch.secondaryPhone = input.secondaryPhone ?? input.contact?.secondaryPhone;
  }

  if (input.email !== undefined || input.contact?.email !== undefined) {
    patch.email = EmailAddress.create(input.email ?? input.contact?.email, {
      field: "email"
    })?.toString() ?? null;
  }

  if (input.secondaryEmail !== undefined || input.contact?.secondaryEmail !== undefined) {
    patch.secondaryEmail = EmailAddress.create(
      input.secondaryEmail ?? input.contact?.secondaryEmail,
      { field: "secondaryEmail" }
    )?.toString() ?? null;
  }

  if (input.preferredLanguage !== undefined || input.contact?.preferredLanguage !== undefined) {
    patch.preferredLanguage = input.preferredLanguage ?? input.contact?.preferredLanguage;
  }

  if (input.timezone !== undefined || input.contact?.timezone !== undefined) {
    patch.timezone = input.timezone ?? input.contact?.timezone;
  }

  if (input.address !== undefined || input.contact?.address !== undefined) {
    patch.address = input.address ?? input.contact?.address;
  }

  if (input.leadSource !== undefined) {
    patch.leadSource = LeadSource.create(input.leadSource).toJSON();
  }

  if (input.communicationChannels !== undefined) {
    patch.communicationChannels = CommunicationChannel.createList(
      input.communicationChannels
    ).map((channel) => channel.toJSON());
  }

  if (input.lifecycleState !== undefined || input.status?.lifecycleState !== undefined) {
    const lifecycleState = input.lifecycleState ?? input.status?.lifecycleState;
    ProspectStatus.isValidState(lifecycleState);
    patch.lifecycleState = lifecycleState;
  }

  if (input.milestone !== undefined || input.status?.milestone !== undefined) {
    patch.milestone = input.milestone ?? input.status?.milestone;
  }

  if (input.ownership !== undefined || input.status?.ownership !== undefined) {
    const ownership = input.ownership ?? input.status?.ownership;

    if (!OWNERSHIP_VALUES.includes(ownership)) {
      throw new ProspectDomainError(`Invalid ownership value: ${ownership}`, {
        publicCode: "VALIDATION_ERROR"
      });
    }

    patch.ownership = ownership;
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      throw new ProspectDomainError("tags must be an array.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    patch.tags = input.tags;
  }

  if (input.customFields !== undefined || input.custom_fields !== undefined) {
    patch.customFields = input.customFields ?? input.custom_fields;
  }

  if (input.aiInsights !== undefined || input.ai_insights !== undefined) {
    patch.aiInsights = input.aiInsights ?? input.ai_insights;
  }

  if (input.businessRelationships !== undefined || input.business_relationships !== undefined) {
    patch.businessRelationships = input.businessRelationships ?? input.business_relationships;
  }

  if (Object.keys(patch).length === 0) {
    throw new ProspectDomainError("No valid fields provided for update.", {
      publicCode: "VALIDATION_ERROR"
    });
  }

  return patch;
}

module.exports = {
  validateUpdateProspectInput
};
