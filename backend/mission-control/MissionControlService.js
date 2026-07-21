/**
 * Sprint 12.5 — Mission Control live operational view (backend only).
 * Subscribes to platform EventBus and maintains counters, index, and activity feed.
 */

const { CommunicationEvent } = require("../communication/events/eventNames");
const { ProspectEvent } = require("../prospects/prospectEvents");
const { OperatorEvent } = require("../operators/operatorEvents");
const { OwnershipMode } = require("../communication/constants/OwnershipMode");
const { MessageDirection } = require("../communication/constants/MessageDirection");
const { LiveConversationIndex } = require("./LiveConversationIndex");
const { ActivityFeed } = require("./ActivityFeed");

class MissionControlService {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus} [deps.eventBus]
   * @param {LiveConversationIndex} [deps.conversationIndex]
   * @param {ActivityFeed} [deps.activityFeed]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.conversationIndex = deps.conversationIndex || new LiveConversationIndex();
    this.activityFeed = deps.activityFeed || new ActivityFeed();
    this._newProspectsToday = 0;
    this._prospectDayKey = this._todayKey();
    this._unsubscribers = [];

    if (this.eventBus) {
      this.subscribe(this.eventBus);
    }
  }

  /**
   * @param {import('../communication/events/EventBus').EventBus} eventBus
   */
  subscribe(eventBus) {
    this.unsubscribe();
    this.eventBus = eventBus;

    const bindings = [
      [CommunicationEvent.MESSAGE_RECEIVED, (payload) => this._onMessageReceived(payload)],
      [CommunicationEvent.MESSAGE_SENT, (payload) => this._onMessageSent(payload)],
      [CommunicationEvent.CONVERSATION_CREATED, (payload) => this._onConversationCreated(payload)],
      [CommunicationEvent.CONVERSATION_UPDATED, (payload) => this._onConversationUpdated(payload)],
      [CommunicationEvent.HUMAN_TAKEOVER, (payload) => this._onHumanTakeover(payload)],
      [CommunicationEvent.HUMAN_RELEASE, (payload) => this._onHumanRelease(payload)],
      [CommunicationEvent.HUMAN_MESSAGE_WAITING, (payload) => this._onHumanMessageWaiting(payload)],
      [ProspectEvent.CREATED, (payload) => this._onProspectCreated(payload)],
      [OperatorEvent.ASSIGNED, (payload) => this._onOperatorAssigned(payload)],
      [OperatorEvent.UNASSIGNED, (payload) => this._onOperatorUnassigned(payload)]
    ];

    for (const [eventName, handler] of bindings) {
      this._unsubscribers.push(eventBus.on(eventName, handler));
    }
  }

  unsubscribe() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  /**
   * @returns {Object}
   */
  getSnapshot() {
    this._rollProspectDayIfNeeded();

    return {
      generatedAt: new Date().toISOString(),
      counters: {
        ...this.conversationIndex.getCounters(),
        newProspectsToday: this._newProspectsToday
      },
      activeConversations: this.conversationIndex.getActiveConversations(),
      waitingQueue: this.conversationIndex.getWaitingQueue(),
      activityFeed: this.activityFeed.getEntries()
    };
  }

  _onMessageReceived(payload) {
    const { conversation, message, prospect } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, {
      prospect,
      lastMessage: message,
      waitingForHuman: conversation.ownershipMode === OwnershipMode.HUMAN
    });

    this.activityFeed.append({
      type: CommunicationEvent.MESSAGE_RECEIVED,
      atlasProspectId: prospect?.atlasId || conversation.atlasProspectId,
      conversationId: conversation.id,
      summary: "Message received",
      metadata: {
        channel: message?.channel || conversation.channel,
        preview: message?.text || ""
      }
    });
  }

  _onMessageSent(payload) {
    const { conversation, message, prospect } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, {
      prospect,
      lastMessage: message
    });

    const isAiReply =
      message?.direction === MessageDirection.OUTBOUND &&
      message?.metadata?.source === "ai";

    this.activityFeed.append({
      type: CommunicationEvent.MESSAGE_SENT,
      atlasProspectId: prospect?.atlasId || conversation.atlasProspectId,
      conversationId: conversation.id,
      summary: isAiReply ? "AI responded" : "Message sent",
      metadata: {
        channel: message?.channel || conversation.channel,
        preview: message?.text || ""
      }
    });
  }

  _onConversationCreated(payload) {
    const { conversation, message, prospect } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, { prospect, lastMessage: message });

    this.activityFeed.append({
      type: CommunicationEvent.CONVERSATION_CREATED,
      atlasProspectId: prospect?.atlasId || conversation.atlasProspectId,
      conversationId: conversation.id,
      summary: "Conversation started",
      metadata: { channel: conversation.channel }
    });
  }

  _onConversationUpdated(payload) {
    const { conversation, message, prospect, reason, routeResult } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, {
      prospect,
      lastMessage: message,
      waitingForHuman:
        conversation.ownershipMode === OwnershipMode.HUMAN &&
        routeResult?.skippedReason === "HUMAN_TAKEOVER"
    });

    if (reason === "transfer_pending") {
      this.activityFeed.append({
        type: CommunicationEvent.CONVERSATION_UPDATED,
        atlasProspectId: prospect?.atlasId || conversation.atlasProspectId,
        conversationId: conversation.id,
        operatorId: payload.operatorId || conversation.assignedOperatorId,
        summary: "Transfer pending",
        metadata: { reason }
      });
      return;
    }

    if (reason) {
      this.activityFeed.append({
        type: CommunicationEvent.CONVERSATION_UPDATED,
        atlasProspectId: prospect?.atlasId || conversation.atlasProspectId,
        conversationId: conversation.id,
        summary: `Conversation updated (${reason})`,
        metadata: { reason }
      });
    }
  }

  _onHumanTakeover(payload) {
    const { conversation, operatorId } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, { waitingForHuman: false });
    this.conversationIndex.clearWaitingForHuman(conversation.id);

    this.activityFeed.append({
      type: CommunicationEvent.HUMAN_TAKEOVER,
      atlasProspectId: conversation.atlasProspectId,
      conversationId: conversation.id,
      operatorId: operatorId || conversation.assignedOperatorId,
      summary: "Human takeover complete"
    });
  }

  _onHumanRelease(payload) {
    const { conversation } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, { waitingForHuman: false });
    this.conversationIndex.clearWaitingForHuman(conversation.id);

    this.activityFeed.append({
      type: CommunicationEvent.HUMAN_RELEASE,
      atlasProspectId: conversation.atlasProspectId,
      conversationId: conversation.id,
      summary: "Conversation released to AI"
    });
  }

  _onHumanMessageWaiting(payload) {
    const { conversation, message, assignedOperatorId } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, {
      waitingForHuman: true,
      lastMessage: message
    });
    this.conversationIndex.markWaitingForHuman(conversation.id);

    this.activityFeed.append({
      type: CommunicationEvent.HUMAN_MESSAGE_WAITING,
      atlasProspectId: conversation.atlasProspectId,
      conversationId: conversation.id,
      operatorId: assignedOperatorId || conversation.assignedOperatorId,
      summary: "Waiting for human response",
      metadata: { preview: message?.text || "" }
    });
  }

  _onProspectCreated(payload) {
    const { prospect } = payload;

    this._rollProspectDayIfNeeded();
    this._newProspectsToday += 1;

    this.activityFeed.append({
      type: ProspectEvent.CREATED,
      atlasProspectId: prospect?.atlasId || null,
      summary: "New prospect created",
      metadata: {
        channelIdentities: prospect?.channelIdentities || []
      }
    });
  }

  _onOperatorAssigned(payload) {
    const { conversation, operator } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, { waitingForHuman: false });

    const operatorName = operator?.displayName || operator?.id || conversation.assignedOperatorId;

    this.activityFeed.append({
      type: OperatorEvent.ASSIGNED,
      atlasProspectId: conversation.atlasProspectId,
      conversationId: conversation.id,
      operatorId: operator?.id || conversation.assignedOperatorId,
      operatorName,
      summary: `Operator ${operatorName} assigned`
    });
  }

  _onOperatorUnassigned(payload) {
    const { conversation, previousOperatorId } = payload;

    if (!conversation) {
      return;
    }

    this.conversationIndex.upsert(conversation, { waitingForHuman: false });

    this.activityFeed.append({
      type: OperatorEvent.UNASSIGNED,
      atlasProspectId: conversation.atlasProspectId,
      conversationId: conversation.id,
      operatorId: previousOperatorId,
      summary: "Operator unassigned"
    });
  }

  _todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _rollProspectDayIfNeeded() {
    const today = this._todayKey();

    if (today !== this._prospectDayKey) {
      this._prospectDayKey = today;
      this._newProspectsToday = 0;
    }
  }
}

module.exports = {
  MissionControlService
};
