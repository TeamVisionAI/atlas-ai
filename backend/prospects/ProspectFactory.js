/**
 * Sprint 12.3 — Prospect entity factory.
 */

const { buildMessengerStorageKey } = require("../core/messengerConstants");

const QUALIFICATION_FIELD_COUNT = 7;

function buildStorageKey(channel, channelUserId) {
  if (channel === "messenger") {
    return buildMessengerStorageKey(channelUserId);
  }

  return `${channel}:${channelUserId}`;
}

function createEmptyQualificationProgress() {
  return {
    profile: {},
    missingFields: [
      "city",
      "state",
      "authorization",
      "occupation",
      "interviewType",
      "schedule",
      "email"
    ],
    nextField: "city",
    percentComplete: 0
  };
}

class ProspectFactory {
  /**
   * @param {Object} params
   * @param {string} params.atlasId
   * @param {string} params.channel
   * @param {string} params.channelUserId
   * @param {string|null} [params.displayName]
   */
  create({ atlasId, channel, channelUserId, displayName = null }) {
    const now = new Date().toISOString();
    const storageKey = buildStorageKey(channel, channelUserId);

    return {
      atlasId,
      displayName,
      storageKey,
      recruitingStage: "NEW",
      qualificationProgress: createEmptyQualificationProgress(),
      assignedOwnerId: null,
      channelIdentities: [
        {
          channel,
          channelUserId,
          linkedAt: now
        }
      ],
      communication: {
        primaryChannel: channel,
        lastChannel: channel,
        lastMessagePreview: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        lastProviderMessageId: null,
        activeConversationId: null,
        conversationIds: [],
        ownershipMode: "ai",
        language: "es"
      },
      conversationHistory: [],
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now
    };
  }

  /**
   * @param {Object} prospect
   * @param {string} channel
   * @param {string} channelUserId
   */
  addChannelIdentity(prospect, channel, channelUserId) {
    const now = new Date().toISOString();
    const identities = prospect.channelIdentities || [];

    identities.push({
      channel,
      channelUserId,
      linkedAt: now
    });

    return {
      ...prospect,
      channelIdentities: identities,
      updatedAt: now,
      lastActivityAt: now
    };
  }
}

module.exports = {
  ProspectFactory,
  QUALIFICATION_FIELD_COUNT,
  buildStorageKey,
  createEmptyQualificationProgress
};
