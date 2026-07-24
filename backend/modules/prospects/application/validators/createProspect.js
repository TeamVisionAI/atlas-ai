/**
 * Sprint 14.1 — Application-layer input validation for create commands.
 */

const crypto = require("crypto");
const { LIFECYCLE_STATES } = require("../../domain/constants");
const { LeadSource } = require("../../domain/value-objects/LeadSource");
const { CommunicationChannel } = require("../../domain/value-objects/CommunicationChannel");
const { EmailAddress } = require("../../domain/value-objects/EmailAddress");
const { PhoneNumber } = require("../../domain/value-objects/PhoneNumber");
const { ContactInformation } = require("../../domain/value-objects/ContactInformation");
const { ProspectStatus } = require("../../domain/value-objects/ProspectStatus");

function validateCreateProspectInput(input = {}) {
  const displayName = input.displayName ?? input.identity?.displayName ?? null;
  const primaryPhone = input.primaryPhone ?? input.contact?.primaryPhone ?? null;
  const email = EmailAddress.create(input.email ?? input.contact?.email, { field: "email" });
  const secondaryEmail = EmailAddress.create(
    input.secondaryEmail ?? input.contact?.secondaryEmail,
    { field: "secondaryEmail" }
  );

  ContactInformation.assertReachable({
    displayName,
    email,
    phone: PhoneNumber.create(primaryPhone)
  });

  const lifecycleState =
    input.lifecycleState ?? input.status?.lifecycleState ?? LIFECYCLE_STATES.NEW_LEAD;

  ProspectStatus.initial(lifecycleState, {
    milestone: input.milestone ?? input.status?.milestone,
    ownership: input.ownership ?? input.status?.ownership
  });

  return {
    prospectId: input.prospectId || crypto.randomUUID(),
    organizationId: input.organizationId,
    displayName: displayName ? String(displayName).trim() : null,
    legalName: input.legalName ?? input.identity?.legalName ?? null,
    primaryPhone: primaryPhone ? String(primaryPhone).trim() : null,
    secondaryPhone: input.secondaryPhone ?? input.contact?.secondaryPhone ?? null,
    email: email ? email.toString() : null,
    secondaryEmail: secondaryEmail ? secondaryEmail.toString() : null,
    preferredLanguage: input.preferredLanguage ?? input.contact?.preferredLanguage ?? "es",
    timezone: input.timezone ?? input.contact?.timezone ?? null,
    address: input.address ?? input.contact?.address ?? {},
    leadSource: LeadSource.create(input.leadSource).toJSON(),
    communicationChannels: CommunicationChannel.createList(input.communicationChannels).map(
      (channel) => channel.toJSON()
    ),
    lifecycleState,
    milestone: input.milestone ?? input.status?.milestone ?? null,
    ownership: input.ownership ?? input.status?.ownership ?? "SYSTEM",
    assignedAgentId: input.assignedAgentId ?? input.assignedAgent?.assignedAgentId ?? null,
    tags: Array.isArray(input.tags) ? input.tags : [],
    customFields: input.customFields ?? input.custom_fields ?? {},
    aiInsights: input.aiInsights ?? input.ai_insights ?? [],
    businessRelationships: input.businessRelationships ?? input.business_relationships ?? {},
    appointments: input.appointments ?? [],
    activities: input.activities ?? []
  };
}

module.exports = {
  validateCreateProspectInput
};
