/**
 * Release 1.3 — Organization state snapshot (no calculations).
 */

const fs = require("fs");
const path = require("path");
const organizationStore = require("../organizations/OrganizationStore");

const DATA_DIR = path.join(__dirname, "../data");

function readJsonFile(filename, fallback) {
  try {
    const filePath = path.join(DATA_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function filterByOrganization(records, organizationId) {
  if (!organizationId || !Array.isArray(records)) {
    return records || [];
  }

  return records.filter(
    (record) => !record.organizationId || record.organizationId === organizationId
  );
}

function isToday(isoString, referenceDate = new Date()) {
  if (!isoString) {
    return false;
  }

  const value = new Date(isoString);
  return (
    value.getFullYear() === referenceDate.getFullYear() &&
    value.getMonth() === referenceDate.getMonth() &&
    value.getDate() === referenceDate.getDate()
  );
}

/**
 * Collect raw organization state. Snapshot only — no derived metrics.
 *
 * @param {Object} input
 * @param {string} input.organizationId
 * @param {Object} [input.organization]
 * @param {Object} [input.packageMetrics]
 * @param {Date} [input.referenceDate]
 */
async function collectOrganizationSnapshot(input) {
  const { organizationId, referenceDate = new Date() } = input;
  const organization =
    input.organization || (await organizationStore.getOrganization(organizationId));

  if (!organization) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  const appointmentsStore = readJsonFile("appointments.json", { appointments: [], activity: [] });
  const meetingsStore = readJsonFile("meetings.json", { meetings: [], activity: [] });
  const gatewayStore = readJsonFile("gatewayStore.json", {
    inbound: [],
    envelopes: [],
    outbound: [],
    errors: []
  });
  const agentStore = readJsonFile("agentStore.json", {
    conversations: [],
    memories: {},
    decisions: [],
    responses: []
  });
  const packageMetrics =
    input.packageMetrics || readJsonFile("teamvisionAnalytics.json", {});

  const appointments = filterByOrganization(appointmentsStore.appointments, organizationId);
  const meetings = filterByOrganization(meetingsStore.meetings, organizationId);
  const conversations = filterByOrganization(agentStore.conversations, organizationId);

  const openConversations = conversations.filter(
    (entry) => entry.ownership !== "HUMAN" && entry.status !== "closed"
  );

  const todayAppointments = appointments.filter((entry) =>
    isToday(entry.startTime, referenceDate)
  );
  const todayMeetings = meetings.filter((entry) => isToday(entry.startTime, referenceDate));

  const pendingFollowUps = conversations.filter((entry) => {
    const memory = agentStore.memories?.[entry.id];

    return Boolean(memory?.pendingFollowUp || memory?.followUpDue);
  });

  const installedPackages = (organization.packages || []).filter((pkg) => pkg.installed);
  const enabledConnectors = Object.entries(organization.connectors || {})
    .filter(([, config]) => config.enabled)
    .map(([connectorId, config]) => ({
      id: connectorId,
      health: config.health || "unknown",
      defaultOfficeId: config.defaultOfficeId || null
    }));

  const failedConnectors = enabledConnectors.filter(
    (connector) => connector.health === "failed" || connector.health === "disconnected"
  );

  return {
    organizationId,
    capturedAt: referenceDate.toISOString(),
    organization: {
      id: organization.id,
      profile: organization.profile,
      version: organization.version || 1
    },
    activePackages: installedPackages.map((pkg) => ({
      id: pkg.id,
      enabled: pkg.enabled !== false,
      configured: Boolean(pkg.configuration)
    })),
    connectorHealth: enabledConnectors,
    users: organization.users || [],
    offices: organization.locations || [],
    openConversations,
    appointments: {
      all: appointments,
      today: todayAppointments,
      pending: appointments.filter((entry) => entry.status === "scheduled")
    },
    meetings: {
      all: meetings,
      today: todayMeetings,
      pending: meetings.filter((entry) =>
        ["confirmed", "scheduled"].includes(entry.lifecycleStatus)
      )
    },
    followUps: {
      pending: pendingFollowUps,
      total: pendingFollowUps.length
    },
    licensingProgress: {
      started: packageMetrics.licensingStarted || 0,
      completed: packageMetrics.licensingCompleted || 0
    },
    fastStartProgress: {
      completed: packageMetrics.fastStartCompleted || 0,
      joined: packageMetrics.joined || 0
    },
    pendingTasks: conversations.filter((entry) => {
      const memory = agentStore.memories?.[entry.id];
      return Boolean(memory?.openTasks?.length);
    }),
    workflowActivity: {
      decisions: filterByOrganization(agentStore.decisions, organizationId),
      gatewayInboundToday: gatewayStore.inbound.filter((entry) =>
        isToday(entry.timestamp, referenceDate)
      ),
      gatewayErrors: gatewayStore.errors.slice(0, 20)
    },
    packageMetricsRaw: packageMetrics,
    failedConnectors
  };
}

module.exports = {
  collectOrganizationSnapshot,
  isToday
};
