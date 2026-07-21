/**
 * Sprint 12.6 — Rolling operational metrics for Executive Dashboard.
 */

class MetricsEngine {
  constructor() {
    /** @type {Set<string>} */
    this._activeProspects = new Set();
    /** @type {Set<string>} */
    this._activeConversations = new Set();
    /** @type {Map<string, number>} */
    this._conversationMessageCounts = new Map();
    /** @type {Map<string, string>} */
    this._firstInboundAt = new Map();
    /** @type {number[]} */
    this._firstResponseDurationsMs = [];
  }

  /**
   * @param {string|null|undefined} atlasProspectId
   */
  trackProspect(atlasProspectId) {
    if (atlasProspectId) {
      this._activeProspects.add(atlasProspectId);
    }
  }

  /**
   * @param {string|null|undefined} conversationId
   * @param {string|null|undefined} atlasProspectId
   */
  trackConversation(conversationId, atlasProspectId) {
    if (conversationId) {
      this._activeConversations.add(conversationId);
    }

    this.trackProspect(atlasProspectId);
  }

  /**
   * @param {string} conversationId
   */
  incrementConversationMessages(conversationId) {
    if (!conversationId) {
      return;
    }

    const current = this._conversationMessageCounts.get(conversationId) || 0;
    this._conversationMessageCounts.set(conversationId, current + 1);
  }

  /**
   * @param {string} conversationId
   * @param {string} timestamp
   */
  recordFirstInbound(conversationId, timestamp) {
    if (!conversationId || this._firstInboundAt.has(conversationId)) {
      return;
    }

    this._firstInboundAt.set(conversationId, timestamp);
  }

  /**
   * @param {string} conversationId
   * @param {string} timestamp
   * @returns {number|null}
   */
  recordFirstResponse(conversationId, timestamp) {
    const inboundAt = this._firstInboundAt.get(conversationId);

    if (!inboundAt) {
      return null;
    }

    const durationMs = new Date(timestamp).getTime() - new Date(inboundAt).getTime();

    if (Number.isNaN(durationMs) || durationMs < 0) {
      return null;
    }

    this._firstResponseDurationsMs.push(durationMs);
    this._firstInboundAt.delete(conversationId);

    return durationMs;
  }

  /**
   * @param {import('./DailyStatistics').DailyStatistics} dailyStatistics
   */
  getMetrics(dailyStatistics) {
    const today = dailyStatistics.getToday();
    const conversationLengths = Array.from(this._conversationMessageCounts.values());

    return {
      messagesReceivedToday: today.messagesReceivedToday,
      messagesSentToday: today.messagesSentToday,
      newProspectsToday: today.newProspectsToday,
      activeProspects: this._activeProspects.size,
      activeConversations: this._activeConversations.size,
      aiResponsesToday: today.aiResponsesToday,
      humanTakeoversToday: today.humanTakeoversToday,
      averageFirstResponseTime: average(this._firstResponseDurationsMs),
      averageConversationLength: average(conversationLengths)
    };
  }

  /**
   * @param {import('./DailyStatistics').DailyStatistics} dailyStatistics
   */
  buildTrends(dailyStatistics) {
    const todayMetrics = this.getMetrics(dailyStatistics);
    const yesterday = dailyStatistics.getYesterday();

    if (!yesterday) {
      return {};
    }

    const yesterdayMetrics = {
      messagesReceivedToday: yesterday.messagesReceivedToday,
      messagesSentToday: yesterday.messagesSentToday,
      newProspectsToday: yesterday.newProspectsToday,
      aiResponsesToday: yesterday.aiResponsesToday,
      humanTakeoversToday: yesterday.humanTakeoversToday,
      averageFirstResponseTime: average(yesterday.firstResponseSamplesMs),
      averageConversationLength: null
    };

    const trendKeys = [
      "messagesReceivedToday",
      "messagesSentToday",
      "newProspectsToday",
      "aiResponsesToday",
      "humanTakeoversToday",
      "averageFirstResponseTime"
    ];

    const trends = {};

    for (const key of trendKeys) {
      trends[key] = buildTrendDelta(todayMetrics[key], yesterdayMetrics[key]);
    }

    return trends;
  }
}

/**
 * @param {number[]} values
 * @returns {number|null}
 */
function average(values) {
  if (!values?.length) {
    return null;
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round(sum / values.length);
}

/**
 * @param {number|null} current
 * @param {number|null} previous
 */
function buildTrendDelta(current, previous) {
  if (current == null || previous == null) {
    return { current, previous, delta: null, direction: "flat" };
  }

  const delta = current - previous;

  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat"
  };
}

module.exports = {
  MetricsEngine,
  average,
  buildTrendDelta
};
