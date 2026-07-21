/**
 * Sprint 12.6 — Daily metric counters with automatic rollover and in-memory history.
 */

function emptyDailyRecord(date) {
  return {
    date,
    messagesReceivedToday: 0,
    messagesSentToday: 0,
    newProspectsToday: 0,
    aiResponsesToday: 0,
    humanTakeoversToday: 0,
    aiErrorsToday: 0,
    operatorAssignmentsToday: 0,
    operatorUnassignmentsToday: 0,
    firstResponseSamplesMs: []
  };
}

class DailyStatistics {
  /**
   * @param {number} [maxHistoryDays]
   */
  constructor(maxHistoryDays = 30) {
    this.maxHistoryDays = maxHistoryDays;
    /** @type {Object} */
    this._today = emptyDailyRecord(this._todayKey());
    /** @type {Object[]} */
    this._history = [];
  }

  _todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _rollDayIfNeeded() {
    const today = this._todayKey();

    if (today === this._today.date) {
      return;
    }

    this._history.unshift({ ...this._today });
    this._history = this._history.slice(0, this.maxHistoryDays);
    this._today = emptyDailyRecord(today);
  }

  /**
   * @param {string} field
   * @param {number} [amount]
   */
  increment(field, amount = 1) {
    this._rollDayIfNeeded();

    if (typeof this._today[field] === "number") {
      this._today[field] += amount;
    }
  }

  /**
   * @param {number} durationMs
   */
  recordFirstResponseSample(durationMs) {
    this._rollDayIfNeeded();
    this._today.firstResponseSamplesMs.push(durationMs);
  }

  /**
   * @returns {Object}
   */
  getToday() {
    this._rollDayIfNeeded();
    return { ...this._today };
  }

  /**
   * @returns {Object|null}
   */
  getYesterday() {
    return this._history[0] ? { ...this._history[0] } : null;
  }

  /**
   * @returns {Object[]}
   */
  getHistory() {
    return this._history.map((entry) => ({ ...entry }));
  }
}

module.exports = {
  DailyStatistics,
  emptyDailyRecord
};
