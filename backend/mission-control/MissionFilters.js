/**
 * Release 1.4 — Mission Control filtering engine.
 */

function matchesString(value, filterValue) {
  if (!filterValue) {
    return true;
  }

  return String(value || "").toLowerCase().includes(String(filterValue).toLowerCase());
}

function withinTimeRange(timestamp, timeFilter) {
  if (!timeFilter?.since) {
    return true;
  }

  return new Date(timestamp).getTime() >= new Date(timeFilter.since).getTime();
}

/**
 * @param {Object[]} items
 * @param {Object} filters
 */
function filterMissionItems(items, filters = {}) {
  return (items || []).filter((item) => {
    if (filters.organizationId && item.organizationId !== filters.organizationId) {
      return false;
    }

    if (filters.officeId && item.officeId !== filters.officeId) {
      return false;
    }

    if (filters.packageId) {
      const packageId = item.packageId || item.metadata?.packageId;
      if (packageId !== filters.packageId) {
        return false;
      }
    }

    if (filters.workflowId && item.workflowId !== filters.workflowId) {
      return false;
    }

    if (filters.conversationId && item.conversationId !== filters.conversationId) {
      return false;
    }

    if (filters.connectorId && item.connectorId !== filters.connectorId) {
      return false;
    }

    if (filters.severity && item.severity !== filters.severity) {
      return false;
    }

    if (filters.userId) {
      const userId = item.userId || item.metadata?.userId;
      if (userId !== filters.userId) {
        return false;
      }
    }

    if (!withinTimeRange(item.timestamp || item.createdAt, filters.time)) {
      return false;
    }

    if (filters.query) {
      const haystack = JSON.stringify(item).toLowerCase();
      if (!haystack.includes(String(filters.query).toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

function filterSnapshot(snapshot, filters = {}) {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    timeline: filterMissionItems(snapshot.timeline, filters),
    alerts: filterMissionItems(snapshot.alerts, filters)
  };
}

module.exports = {
  filterMissionItems,
  filterSnapshot,
  matchesString
};
