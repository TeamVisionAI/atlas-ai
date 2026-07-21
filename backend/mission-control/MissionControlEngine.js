/**
 * Release 1.4 — Mission Control Engine orchestrator.
 */

const { MissionEvent } = require("./MissionEvents");
const missionStore = require("./MissionStore");
const { createEmptyMissionState } = require("./MissionState");
const { processMissionEvent, getSubscribedEvents } = require("./MissionEventProcessor");
const { calculateMissionMetrics } = require("./MissionMetrics");
const { generateMissionAlerts } = require("./MissionAlerts");
const { calculateMissionHealth } = require("./MissionHealth");
const { buildMissionSnapshot } = require("./MissionSnapshot");
const { filterMissionItems, filterSnapshot } = require("./MissionFilters");
const { formatMissionControl } = require("./MissionFormatter");
const { prependTimeline } = require("./MissionTimeline");

class MissionControlEngine {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this._states = new Map();
    this._timelines = new Map();
    this._unsubscribers = [];
    this._lastHealth = new Map();

    if (this.eventBus) {
      this.subscribe(this.eventBus);
    }
  }

  subscribe(eventBus) {
    this.unsubscribe();
    this.eventBus = eventBus;

    for (const eventName of getSubscribedEvents()) {
      this._unsubscribers.push(
        eventBus.on(eventName, (payload) => {
          this.processEvent(eventName, payload).catch(() => {
            // Mission Control must not crash event bus handlers.
          });
        })
      );
    }
  }

  unsubscribe() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  async getOrCreateState(organizationId) {
    if (this._states.has(organizationId)) {
      return this._states.get(organizationId);
    }

    const persisted = await missionStore.getState(organizationId);

    if (persisted) {
      this._states.set(organizationId, persisted);
      return persisted;
    }

    const state = createEmptyMissionState(organizationId);
    this._states.set(organizationId, state);
    return state;
  }

  async processEvent(eventName, payload = {}) {
    const organizationId =
      payload.organizationId || payload.organization?.id || payload.user?.organizationId || "default";

    const state = await this.getOrCreateState(organizationId);
    const { state: nextState, timelineEntry, sideEffects } = processMissionEvent(
      state,
      eventName,
      payload
    );

    this._states.set(organizationId, nextState);
    await missionStore.saveState(organizationId, nextState);

    if (timelineEntry) {
      const timeline = prependTimeline(this._timelines.get(organizationId) || [], timelineEntry);
      this._timelines.set(organizationId, timeline);
      await missionStore.appendTimeline({ ...timelineEntry, organizationId });

      this.eventBus?.emit(MissionEvent.TIMELINE_UPDATED, {
        organizationId,
        entry: timelineEntry
      });
    }

    const metrics = calculateMissionMetrics(nextState);
    await missionStore.appendMetricsHistory({ organizationId, ...metrics });

    this.eventBus?.emit(MissionEvent.METRICS_UPDATED, {
      organizationId,
      metrics
    });

    const health = calculateMissionHealth(nextState, metrics);
    const previousHealth = this._lastHealth.get(organizationId);

    if (JSON.stringify(previousHealth) !== JSON.stringify(health)) {
      this._lastHealth.set(organizationId, health);
      await missionStore.appendHealthHistory({ organizationId, health });

      this.eventBus?.emit(MissionEvent.HEALTH_CHANGED, {
        organizationId,
        health
      });
    }

    const alerts = generateMissionAlerts(nextState, metrics);

    for (const alert of alerts) {
      const store = missionStore.readStore();
      const exists = store.alerts.some(
        (entry) =>
          !entry.resolved &&
          entry.organizationId === organizationId &&
          entry.affectedComponent === alert.affectedComponent &&
          entry.reason === alert.reason
      );

      if (!exists) {
        await missionStore.saveAlert(alert);

        this.eventBus?.emit(MissionEvent.ALERT_CREATED, {
          organizationId,
          alert
        });
      }
    }

    if (sideEffects.responseLatencyMs) {
      await missionStore.recordResponseLatency(sideEffects.responseLatencyMs);
    }

    const analyticsPatch = {};

    if (sideEffects.incrementConversationVolume) {
      analyticsPatch.conversationVolume =
        (missionStore.readStore().analytics.conversationVolume || 0) + 1;
    }

    if (sideEffects.incrementWorkflowVolume) {
      analyticsPatch.workflowVolume = (missionStore.readStore().analytics.workflowVolume || 0) + 1;
    }

    if (sideEffects.incrementConnectorEvents) {
      analyticsPatch.connectorEvents = (missionStore.readStore().analytics.connectorEvents || 0) + 1;
    }

    if (sideEffects.incrementPackageEvents) {
      analyticsPatch.packageEvents = (missionStore.readStore().analytics.packageEvents || 0) + 1;
    }

    if (Object.keys(analyticsPatch).length) {
      await missionStore.updateAnalytics(analyticsPatch);
    }

    this.eventBus?.emit(MissionEvent.UPDATED, {
      organizationId,
      eventName,
      updatedAt: nextState.updatedAt
    });

    return nextState;
  }

  async createSnapshot(organizationId, options = {}) {
    const state = await this.getOrCreateState(organizationId);
    const timeline = this._timelines.get(organizationId) || [];
    const snapshot = buildMissionSnapshot({
      state,
      timeline,
      organizationName: options.organizationName
    });

    await missionStore.saveSnapshot(snapshot);

    this.eventBus?.emit(MissionEvent.SNAPSHOT_CREATED, {
      organizationId,
      timestamp: snapshot.timestamp
    });

    return snapshot;
  }

  async getLiveState(organizationId) {
    return this.getOrCreateState(organizationId);
  }

  async getMetrics(organizationId) {
    const state = await this.getOrCreateState(organizationId);
    return calculateMissionMetrics(state);
  }

  async getTimeline(organizationId, filters = {}) {
    const timeline = this._timelines.get(organizationId) || missionStore.readStore().timeline;
    return filterMissionItems(
      timeline.filter((entry) => entry.organizationId === organizationId),
      filters
    );
  }

  async getAlerts(organizationId, filters = {}) {
    const alerts = missionStore
      .readStore()
      .alerts.filter((entry) => entry.organizationId === organizationId && !entry.resolved);
    return filterMissionItems(alerts, filters);
  }

  async resolveAlert(alertId) {
    const alert = await missionStore.resolveAlert(alertId);

    if (alert) {
      this.eventBus?.emit(MissionEvent.ALERT_RESOLVED, {
        organizationId: alert.organizationId,
        alertId
      });
    }

    return alert;
  }

  async getFilteredSnapshot(organizationId, filters = {}, options = {}) {
    const snapshot = await this.createSnapshot(organizationId, options);
    return filterSnapshot(snapshot, filters);
  }

  formatSnapshot(snapshot, format = "json") {
    return formatMissionControl(snapshot, format);
  }

  async getAnalytics() {
    return missionStore.readStore().analytics;
  }
}

function createMissionControlEngine(deps = {}) {
  return new MissionControlEngine(deps);
}

function resetMissionControlEngine() {
  missionStore.clearStore();
}

module.exports = {
  MissionControlEngine,
  createMissionControlEngine,
  resetMissionControlEngine
};
