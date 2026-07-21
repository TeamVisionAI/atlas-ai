/**
 * Sprint 12.3 — Prospect domain service.
 * Separate from conversations — maps channel identities to permanent Atlas IDs.
 */

const { AtlasIdGenerator } = require("./AtlasIdGenerator");
const { ProspectFactory, QUALIFICATION_FIELD_COUNT, buildStorageKey } = require("./ProspectFactory");
const { ProspectRepository } = require("./ProspectRepository");
const { ProspectEvent } = require("./prospectEvents");
const { findProspect } = require("../services/supabaseService");
const {
  buildProfileFromProspect,
  getMissingFields,
  getNextMissingField,
  deriveCurrentStep
} = require("../core/informationModel");
const { parseSchedulingState } = require("../core/schedulingState");

const MAX_STORED_HISTORY = 100;

function buildQualificationProgress(supabaseProspect, channel) {
  const profile = buildProfileFromProspect(supabaseProspect, channel);
  const schedulingState = parseSchedulingState(supabaseProspect?.notes);
  const missingFields = getMissingFields(profile);
  const collectedCount = QUALIFICATION_FIELD_COUNT - missingFields.length;

  return {
    profile,
    missingFields,
    nextField: getNextMissingField(profile),
    percentComplete: Math.max(
      0,
      Math.min(100, Math.round((collectedCount / QUALIFICATION_FIELD_COUNT) * 100))
    ),
    schedulingPhase: schedulingState?.phase || null
  };
}

function summarizeHistory(conversationId, history = []) {
  return history.slice(-MAX_STORED_HISTORY).map((entry) => ({
    conversationId,
    messageId: entry.id || null,
    direction: entry.direction,
    channel: entry.channel,
    type: entry.type,
    text: entry.text || "",
    timestamp: entry.timestamp
  }));
}

class ProspectService {
  /**
   * @param {Object} [deps]
   * @param {ProspectRepository} [deps.repository]
   * @param {ProspectFactory} [deps.factory]
   * @param {AtlasIdGenerator} [deps.idGenerator]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new ProspectRepository();
    this.factory = deps.factory || new ProspectFactory();
    this.idGenerator = deps.idGenerator || new AtlasIdGenerator(this.repository);
    this.eventBus = deps.eventBus || null;
  }

  /**
   * Find or create a prospect from a channel identity.
   * @param {Object} params
   * @param {string} params.channel
   * @param {string} params.channelUserId
   * @param {string|null} [params.displayName]
   * @returns {Promise<{ prospect: Object, created: boolean, channelLinked: boolean }>}
   */
  async resolveFromChannelIdentity({ channel, channelUserId, displayName = null }) {
    const existing = await this.repository.findByChannelIdentity(channel, channelUserId);

    if (existing) {
      const prospect = await this.updateLastActivity(existing.atlasId);

      this.eventBus?.emit(ProspectEvent.UPDATED, {
        prospect,
        reason: "activity"
      });

      return {
        prospect,
        created: false,
        channelLinked: false
      };
    }

    const atlasId = await this.idGenerator.nextId();
    const prospect = this.factory.create({
      atlasId,
      channel,
      channelUserId,
      displayName
    });

    await this.repository.save(prospect);

    this.eventBus?.emit(ProspectEvent.CREATED, { prospect });

    return {
      prospect,
      created: true,
      channelLinked: true
    };
  }

  /**
   * Link an additional channel identity to an existing prospect.
   * @param {string} atlasId
   * @param {string} channel
   * @param {string} channelUserId
   */
  async linkChannel(atlasId, channel, channelUserId) {
    const prospect = await this.repository.findByAtlasId(atlasId);

    if (!prospect) {
      throw new Error(`Prospect not found: ${atlasId}`);
    }

    const existingIdentity = prospect.channelIdentities?.find(
      (identity) => identity.channel === channel && identity.channelUserId === channelUserId
    );

    if (existingIdentity) {
      return { prospect, linked: false };
    }

    const conflict = await this.repository.findByChannelIdentity(channel, channelUserId);

    if (conflict && conflict.atlasId !== atlasId) {
      throw new Error(`Channel identity already linked to ${conflict.atlasId}`);
    }

    const updated = this.factory.addChannelIdentity(prospect, channel, channelUserId);
    await this.repository.save(updated);

    this.eventBus?.emit(ProspectEvent.LINKED_CHANNEL, {
      prospect: updated,
      channel,
      channelUserId
    });

    this.eventBus?.emit(ProspectEvent.UPDATED, {
      prospect: updated,
      reason: "channel_linked"
    });

    return { prospect: updated, linked: true };
  }

  /**
   * @param {string} atlasId
   */
  async updateLastActivity(atlasId) {
    const prospect = await this.repository.findByAtlasId(atlasId);

    if (!prospect) {
      throw new Error(`Prospect not found: ${atlasId}`);
    }

    const now = new Date().toISOString();
    const updated = {
      ...prospect,
      lastActivityAt: now,
      updatedAt: now
    };

    await this.repository.save(updated);
    return updated;
  }

  /**
   * @param {string} channel
   * @param {string} channelUserId
   */
  async findByChannelIdentity(channel, channelUserId) {
    return this.repository.findByChannelIdentity(channel, channelUserId);
  }

  /**
   * @param {string} atlasId
   */
  async findByAtlasId(atlasId) {
    return this.repository.findByAtlasId(atlasId);
  }

  /**
   * @returns {Promise<Object[]>}
   */
  async listProspects() {
    return this.repository.listAll();
  }

  /**
   * Persist and enrich an Atlas prospect after a channel conversation turn.
   * @param {Object} params
   * @param {string} params.atlasId
   * @param {import('../communication/models/Conversation').Conversation} params.conversation
   * @param {import('../communication/gateway/ConversationManager').ConversationManager} params.conversationManager
   * @param {import('../communication/models/GatewayMessage').GatewayMessage} params.inboundMessage
   * @param {string} params.providerMessageId
   * @param {import('../communication/models/GatewayMessage').GatewayMessage|null} [params.outboundMessage]
   * @param {{ handoff?: Object|null, fallback?: boolean }|null} [params.aiResult]
   */
  async enrichFromChannelTurn({
    atlasId,
    conversation,
    conversationManager,
    inboundMessage,
    providerMessageId,
    outboundMessage = null,
    aiResult = null
  }) {
    const prospect = await this.repository.findByAtlasId(atlasId);

    if (!prospect) {
      throw new Error(`Prospect not found: ${atlasId}`);
    }

    const now = new Date().toISOString();
    const channel = inboundMessage.channel;
    const storageKey =
      prospect.storageKey ||
      buildStorageKey(channel, inboundMessage.senderId);
    const conversationIds = Array.from(
      new Set([...(prospect.communication?.conversationIds || []), conversation.id])
    );
    const history = await conversationManager.getHistory(conversation.id);

    let supabaseProspect = null;

    try {
      supabaseProspect = await findProspect(storageKey);
    } catch {
      supabaseProspect = null;
    }

    const qualificationProgress = supabaseProspect
      ? buildQualificationProgress(supabaseProspect, channel)
      : prospect.qualificationProgress;

    const recruitingStage =
      supabaseProspect?.current_step ||
      (qualificationProgress.nextField
        ? deriveCurrentStep(
            qualificationProgress.profile,
            parseSchedulingState(supabaseProspect?.notes)
          )
        : prospect.recruitingStage);

    const updated = {
      ...prospect,
      storageKey,
      displayName:
        prospect.displayName ||
        supabaseProspect?.name ||
        inboundMessage.metadata?.displayName ||
        null,
      recruitingStage,
      qualificationProgress,
      assignedOwnerId: conversation.assignedOperatorId || prospect.assignedOwnerId || null,
      communication: {
        ...(prospect.communication || {}),
        primaryChannel: prospect.communication?.primaryChannel || channel,
        lastChannel: channel,
        lastMessagePreview: String(inboundMessage.text || "").slice(0, 240) || null,
        lastInboundAt: inboundMessage.timestamp || now,
        lastOutboundAt: outboundMessage?.timestamp || prospect.communication?.lastOutboundAt || null,
        lastProviderMessageId: providerMessageId,
        activeConversationId: conversation.id,
        conversationIds,
        ownershipMode: conversation.ownershipMode,
        language:
          supabaseProspect?.language ||
          supabaseProspect?.communication_language ||
          prospect.communication?.language ||
          "es",
        lastEngineProvider: aiResult?.provider || prospect.communication?.lastEngineProvider || null,
        handoffReady: Boolean(aiResult?.handoff?.handoffReady)
      },
      conversationHistory: summarizeHistory(conversation.id, history),
      updatedAt: now,
      lastActivityAt: now
    };

    await this.repository.save(updated);

    this.eventBus?.emit(ProspectEvent.UPDATED, {
      prospect: updated,
      reason: "channel_turn_enriched"
    });

    return updated;
  }
}

module.exports = {
  ProspectService
};
