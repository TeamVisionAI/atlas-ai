/**
 * Sprint 12.6 — Executive Dashboard analytics backend (EventBus-driven).
 */

const { CommunicationEvent } = require("../communication/events/eventNames");
const { ProspectEvent } = require("../prospects/prospectEvents");
const { OperatorEvent } = require("../operators/operatorEvents");
const { MessageDirection } = require("../communication/constants/MessageDirection");
const { DailyStatistics } = require("./DailyStatistics");
const { MetricsEngine } = require("./MetricsEngine");

class ExecutiveDashboardService {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus} [deps.eventBus]
   * @param {DailyStatistics} [deps.dailyStatistics]
   * @param {MetricsEngine} [deps.metricsEngine]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.dailyStatistics = deps.dailyStatistics || new DailyStatistics();
    this.metricsEngine = deps.metricsEngine || new MetricsEngine();
    /** @type {Set<string>} */
    this._firstResponseRecorded = new Set();
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
      [CommunicationEvent.AI_RESPONSE_GENERATED, (payload) => this._onAiResponseGenerated(payload)],
      [CommunicationEvent.AI_ERROR, (payload) => this._onAiError(payload)],
      [ProspectEvent.CREATED, (payload) => this._onProspectCreated(payload)],
      [ProspectEvent.UPDATED, (payload) => this._onProspectUpdated(payload)],
      [CommunicationEvent.HUMAN_TAKEOVER, (payload) => this._onHumanTakeover(payload)],
      [CommunicationEvent.HUMAN_RELEASE, () => this._noop()],
      [OperatorEvent.ASSIGNED, () => this.dailyStatistics.increment("operatorAssignmentsToday")],
      [OperatorEvent.UNASSIGNED, () => this.dailyStatistics.increment("operatorUnassignmentsToday")]
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
  getSummary() {
    const today = this.dailyStatistics.getToday();

    return {
      generatedAt: new Date().toISOString(),
      metrics: this.metricsEngine.getMetrics(this.dailyStatistics),
      trends: this.metricsEngine.buildTrends(this.dailyStatistics),
      today: {
        date: today.date,
        messagesReceivedToday: today.messagesReceivedToday,
        messagesSentToday: today.messagesSentToday,
        newProspectsToday: today.newProspectsToday,
        aiResponsesToday: today.aiResponsesToday,
        humanTakeoversToday: today.humanTakeoversToday,
        aiErrorsToday: today.aiErrorsToday,
        operatorAssignmentsToday: today.operatorAssignmentsToday,
        operatorUnassignmentsToday: today.operatorUnassignmentsToday
      },
      history: this.dailyStatistics.getHistory()
    };
  }

  _onMessageReceived(payload) {
    const { conversation, message, prospect } = payload;

    this.dailyStatistics.increment("messagesReceivedToday");
    this.metricsEngine.trackConversation(conversation?.id, prospect?.atlasId || conversation?.atlasProspectId);
    this.metricsEngine.incrementConversationMessages(conversation?.id);

    if (conversation?.id && message?.timestamp) {
      this.metricsEngine.recordFirstInbound(conversation.id, message.timestamp);
    }
  }

  _onMessageSent(payload) {
    const { conversation, message, prospect } = payload;

    this.dailyStatistics.increment("messagesSentToday");
    this.metricsEngine.trackConversation(conversation?.id, prospect?.atlasId || conversation?.atlasProspectId);
    this.metricsEngine.incrementConversationMessages(conversation?.id);

    const isAiReply =
      message?.direction === MessageDirection.OUTBOUND &&
      message?.metadata?.source === "ai";

    if (isAiReply) {
      this._recordFirstResponseIfNeeded(conversation?.id, message?.timestamp || payload.emittedAt);
    }
  }

  _onAiResponseGenerated(payload) {
    const { conversation } = payload;

    this.dailyStatistics.increment("aiResponsesToday");
    this.metricsEngine.trackConversation(conversation?.id, conversation?.atlasProspectId);
  }

  _onAiError() {
    this.dailyStatistics.increment("aiErrorsToday");
  }

  _onProspectCreated(payload) {
    const { prospect } = payload;

    this.dailyStatistics.increment("newProspectsToday");
    this.metricsEngine.trackProspect(prospect?.atlasId);
  }

  _onProspectUpdated(payload) {
    const { prospect } = payload;
    this.metricsEngine.trackProspect(prospect?.atlasId);
  }

  _onHumanTakeover(payload) {
    const { conversation } = payload;

    this.dailyStatistics.increment("humanTakeoversToday");
    this.metricsEngine.trackConversation(conversation?.id, conversation?.atlasProspectId);
  }

  _recordFirstResponseIfNeeded(conversationId, timestamp) {
    if (!conversationId || !timestamp || this._firstResponseRecorded.has(conversationId)) {
      return;
    }

    const durationMs = this.metricsEngine.recordFirstResponse(conversationId, timestamp);

    if (durationMs != null) {
      this._firstResponseRecorded.add(conversationId);
      this.dailyStatistics.recordFirstResponseSample(durationMs);
    }
  }

  _noop() {}
}

module.exports = {
  ExecutiveDashboardService
};
