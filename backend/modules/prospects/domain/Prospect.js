/**
 * Sprint 14.1 — Prospect aggregate root.
 * Implements PROSPECT_MODEL.md — one Prospect = one truth.
 */

const crypto = require("crypto");
const { DEFAULT_ORGANIZATION_ID } = require("./constants");
const { ProspectDomainError } = require("./errors/ProspectDomainError");
const { ContactInformation } = require("./value-objects/ContactInformation");
const { LeadSource } = require("./value-objects/LeadSource");
const { CommunicationChannel } = require("./value-objects/CommunicationChannel");
const { ProspectStatus } = require("./value-objects/ProspectStatus");
const { AssignedAgent } = require("./value-objects/AssignedAgent");
const { OWNERSHIP_VALUES } = require("./constants");

class Prospect {
  /**
   * @param {Object} props
   */
  constructor(props) {
    this._prospectId = props.prospectId;
    this._organizationId = props.organizationId;
    this._displayName = props.displayName;
    this._legalName = props.legalName;
    this._contact = props.contact;
    this._leadSource = props.leadSource;
    this._communicationChannels = props.communicationChannels;
    this._status = props.status;
    this._assignedAgent = props.assignedAgent;
    this._appointments = props.appointments || [];
    this._activities = props.activities || [];
    this._timeline = props.timeline || {};
    this._tags = props.tags || [];
    this._customFields = props.customFields || {};
    this._aiInsights = props.aiInsights || [];
    this._businessRelationships = props.businessRelationships || {};
    this._mergedIntoId = props.mergedIntoId || null;
    this._archivedAt = props.archivedAt || null;
    this._deletedAt = props.deletedAt || null;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  /**
   * Factory for new Prospects.
   * @param {Object} input
   * @returns {Prospect}
   */
  static create(input) {
    const now = new Date().toISOString();
    const prospectId = input.prospectId || crypto.randomUUID();

    const contact = ContactInformation.create({
      displayName: input.displayName,
      primaryPhone: input.primaryPhone,
      secondaryPhone: input.secondaryPhone,
      email: input.email,
      secondaryEmail: input.secondaryEmail,
      preferredLanguage: input.preferredLanguage,
      timezone: input.timezone,
      address: input.address
    });

    return new Prospect({
      prospectId,
      organizationId: input.organizationId || DEFAULT_ORGANIZATION_ID,
      displayName: input.displayName ? String(input.displayName).trim() : null,
      legalName: input.legalName ?? null,
      contact,
      leadSource: LeadSource.create(input.leadSource),
      communicationChannels: CommunicationChannel.createList(input.communicationChannels),
      status: ProspectStatus.initial(input.lifecycleState, {
        milestone: input.milestone,
        ownership: input.ownership,
        stateEnteredAt: now
      }),
      assignedAgent: input.assignedAgentId
        ? new AssignedAgent({
            assignedAgentId: input.assignedAgentId,
            assignedAt: input.assignedAt ?? null,
            assignedBy: input.assignedBy ?? null,
            assignmentReason: input.assignmentReason ?? null
          })
        : new AssignedAgent(),
      appointments: input.appointments || [],
      activities: input.activities || [],
      timeline: input.timeline || {},
      tags: input.tags || [],
      customFields: input.customFields || {},
      aiInsights: input.aiInsights || [],
      businessRelationships: input.businessRelationships || {},
      mergedIntoId: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  /**
   * Reconstitute from persistence — no invariant re-validation beyond structure.
   * @param {Object} props
   * @returns {Prospect}
   */
  static reconstitute(props) {
    return new Prospect({
      prospectId: props.prospectId,
      organizationId: props.organizationId,
      displayName: props.displayName,
      legalName: props.legalName,
      contact: new ContactInformation({
        primaryPhone: props.contact.primaryPhone,
        secondaryPhone: props.contact.secondaryPhone,
        normalizedPrimaryPhone: props.contact.normalizedPrimaryPhone,
        email: props.contact.email,
        secondaryEmail: props.contact.secondaryEmail,
        preferredLanguage: props.contact.preferredLanguage,
        timezone: props.contact.timezone,
        address: props.contact.address
      }),
      leadSource: new LeadSource(props.leadSource),
      communicationChannels: (props.communicationChannels || []).map(
        (channel) => new CommunicationChannel(channel)
      ),
      status: new ProspectStatus(props.status),
      assignedAgent: new AssignedAgent(props.assignedAgent),
      appointments: props.appointments || [],
      activities: props.activities || [],
      timeline: props.timeline || {},
      tags: props.tags || [],
      customFields: props.customFields || {},
      aiInsights: props.aiInsights || [],
      businessRelationships: props.businessRelationships || {},
      mergedIntoId: props.mergedIntoId,
      archivedAt: props.archivedAt,
      deletedAt: props.deletedAt,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt
    });
  }

  get prospectId() {
    return this._prospectId;
  }

  get organizationId() {
    return this._organizationId;
  }

  get archivedAt() {
    return this._archivedAt;
  }

  get mergedIntoId() {
    return this._mergedIntoId;
  }

  /**
   * @param {Object} patch
   * @returns {string[]} changed field names
   */
  applyUpdate(patch) {
    const changed = [];

    if (patch.displayName !== undefined) {
      this._displayName = String(patch.displayName).trim();
      changed.push("displayName");
    }

    if (patch.legalName !== undefined) {
      this._legalName = patch.legalName;
      changed.push("legalName");
    }

    const contactPatch = {};
    ["primaryPhone", "secondaryPhone", "email", "secondaryEmail", "preferredLanguage", "timezone", "address"].forEach(
      (field) => {
        if (patch[field] !== undefined) {
          contactPatch[field] = patch[field];
        }
      }
    );

    if (Object.keys(contactPatch).length > 0) {
      this._contact = this._contact.withPatch(contactPatch, this._displayName);
      changed.push(...Object.keys(contactPatch));
    }

    if (patch.leadSource !== undefined) {
      this._leadSource = LeadSource.create(patch.leadSource);
      changed.push("leadSource");
    }

    if (patch.communicationChannels !== undefined) {
      this._communicationChannels = CommunicationChannel.createList(patch.communicationChannels);
      changed.push("communicationChannels");
    }

    if (patch.lifecycleState !== undefined) {
      this._status = this._status.transitionTo(patch.lifecycleState, {
        milestone: patch.milestone,
        ownership: patch.ownership
      });
      changed.push("lifecycleState");
    } else {
      if (patch.milestone !== undefined) {
        this._status = new ProspectStatus({
          ...this._status.toJSON(),
          milestone: patch.milestone
        });
        changed.push("milestone");
      }

      if (patch.ownership !== undefined) {
        if (!OWNERSHIP_VALUES.includes(patch.ownership)) {
          throw new ProspectDomainError(`Invalid ownership value: ${patch.ownership}`, {
            publicCode: "VALIDATION_ERROR"
          });
        }

        this._status = new ProspectStatus({
          ...this._status.toJSON(),
          ownership: patch.ownership
        });
        changed.push("ownership");
      }
    }

    if (patch.tags !== undefined) {
      this._tags = patch.tags;
      changed.push("tags");
    }

    if (patch.customFields !== undefined) {
      this._customFields = patch.customFields;
      changed.push("customFields");
    }

    if (patch.aiInsights !== undefined) {
      this._aiInsights = patch.aiInsights;
      changed.push("aiInsights");
    }

    if (patch.businessRelationships !== undefined) {
      this._businessRelationships = patch.businessRelationships;
      changed.push("businessRelationships");
    }

    this._touch();
    return changed;
  }

  archive() {
    if (this._archivedAt) {
      return false;
    }

    this._archivedAt = new Date().toISOString();
    this._touch();
    return true;
  }

  restore() {
    if (!this._archivedAt) {
      return false;
    }

    this._archivedAt = null;
    this._touch();
    return true;
  }

  /**
   * @param {Object} assignment
   * @param {string} actor
   */
  assign(assignment, actor = "SYSTEM") {
    this._assignedAgent = AssignedAgent.assign(assignment, actor);
    this._touch();
  }

  /**
   * @param {string} survivorId
   */
  markMergedInto(survivorId) {
    if (this._mergedIntoId) {
      throw new ProspectDomainError("Prospect has already been merged.", {
        statusCode: 409,
        publicCode: "ALREADY_MERGED"
      });
    }

    this._mergedIntoId = survivorId;
    this._archivedAt = new Date().toISOString();
    this._touch();
  }

  _touch() {
    this._updatedAt = new Date().toISOString();
  }

  /** API / read-model shape (unchanged contract). */
  toJSON() {
    return {
      prospectId: this._prospectId,
      organizationId: this._organizationId,
      identity: {
        displayName: this._displayName,
        legalName: this._legalName,
        mergedIntoId: this._mergedIntoId,
        createdAt: this._createdAt,
        updatedAt: this._updatedAt
      },
      contact: this._contact.toJSON(),
      leadSource: this._leadSource.toJSON(),
      communicationChannels: this._communicationChannels.map((channel) => channel.toJSON()),
      status: this._status.toJSON(),
      assignedAgent: this._assignedAgent.toJSON(),
      appointments: this._appointments,
      activities: this._activities,
      timeline: this._timeline,
      tags: this._tags,
      customFields: this._customFields,
      aiInsights: this._aiInsights,
      businessRelationships: this._businessRelationships,
      archivedAt: this._archivedAt,
      deletedAt: this._deletedAt
    };
  }
}

module.exports = {
  Prospect
};
