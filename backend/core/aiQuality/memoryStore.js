/**
 * BR-175 — in-memory store for tests. Not used in production.
 */

const { CASE_STATUSES } = require("./constants");

function createMemoryStore(seedCases = []) {
  const cases = new Map(seedCases.map((row) => [row.id, { ...row }]));
  const settings = new Map();
  const regressions = new Map();
  const proposals = new Map();
  const implementations = new Map();
  const learningActions = [];
  const audits = [];

  function mergeById(collection, id, patch) {
    const current = collection.get(id);
    if (!current) {
      return null;
    }
    const next = { ...current, ...patch, updatedAt: patch.updatedAt || new Date().toISOString() };
    collection.set(id, next);
    return next;
  }

  return {
    cases,
    settings,
    regressions,
    proposals,
    implementations,
    learningActions,
    audits,
    async getTenantSettings(organizationId) {
      return settings.get(String(organizationId)) || null;
    },
    async upsertTenantSettings(organizationId, patch) {
      const current = settings.get(String(organizationId)) || {
        organizationId,
        participationEnabled: false,
        mode: "OFF",
        sampleRate: 1
      };
      const next = { ...current, ...patch, organizationId };
      settings.set(String(organizationId), next);
      return next;
    },
    async findOpenByEpisodeKey(organizationId, episodeKey) {
      return [...cases.values()].find(
        (row) =>
          row.organizationId === organizationId &&
          row.episodeKey === episodeKey &&
          (row.status === CASE_STATUSES.NEW || row.status === CASE_STATUSES.REVIEWING)
      ) || null;
    },
    async insertCase(row) {
      cases.set(row.id, row);
      return row;
    },
    async getCase(id) {
      return cases.get(id) || null;
    },
    async listCases({ organizationId = null, signalType = null, tab = null } = {}) {
      let rows = [...cases.values()];
      if (organizationId) {
        rows = rows.filter((row) => row.organizationId === organizationId);
      }
      if (signalType) {
        rows = rows.filter((row) => row.signalType === signalType);
      }
      if (tab === "disagreements") {
        rows = rows.filter((row) => String(row.signalType).includes("DISAGREEMENT") || row.signalType === "SEMANTIC_OBJECTION_MISSED");
      }
      if (tab === "attention") {
        rows = rows.filter((row) => !String(row.signalType).startsWith("SEMANTIC_") || row.signalType === "SEMANTIC_OBJECTION_MISSED");
      }
      if (tab === "regressions") {
        rows = rows.filter((row) => row.status === CASE_STATUSES.REGRESSION_CANDIDATE);
      }
      return rows.sort((a, b) => String(b.detectedAt || "").localeCompare(String(a.detectedAt || "")));
    },
    async updateCase(id, patch) {
      const current = cases.get(id);
      if (!current) {
        return null;
      }
      const next = { ...current, ...patch };
      cases.set(id, next);
      return next;
    },
    async insertRegression(row) {
      regressions.set(row.id, row);
      return row;
    },
    async updateRegression(id, patch) {
      return mergeById(regressions, id, patch);
    },
    async listRegressions({ organizationId = null } = {}) {
      let rows = [...regressions.values()];
      if (organizationId) {
        rows = rows.filter((row) => row.organizationId === organizationId);
      }
      return rows;
    },
    async getRegression(id) {
      return regressions.get(id) || null;
    },
    async getRegressionByCase(caseId) {
      return [...regressions.values()].find((row) => row.caseId === caseId) || null;
    },
    async upsertProposal(row) {
      const current = proposals.get(row.id);
      const next = { ...(current || {}), ...row };
      proposals.set(row.id, next);
      return next;
    },
    async updateProposal(id, patch) {
      return mergeById(proposals, id, patch);
    },
    async getProposal(id) {
      return proposals.get(id) || null;
    },
    async getProposalByCase(caseId) {
      return [...proposals.values()].find((row) => row.caseId === caseId) || null;
    },
    async listProposals({ organizationId = null } = {}) {
      let rows = [...proposals.values()];
      if (organizationId) {
        rows = rows.filter((row) => row.organizationId === organizationId);
      }
      return rows;
    },
    async upsertImplementation(row) {
      const current = implementations.get(row.id);
      const next = { ...(current || {}), ...row };
      implementations.set(row.id, next);
      return next;
    },
    async updateImplementation(id, patch) {
      return mergeById(implementations, id, patch);
    },
    async getImplementation(id) {
      return implementations.get(id) || null;
    },
    async getImplementationByCase(caseId) {
      return [...implementations.values()].find((row) => row.caseId === caseId) || null;
    },
    async listImplementations({ organizationId = null } = {}) {
      let rows = [...implementations.values()];
      if (organizationId) {
        rows = rows.filter((row) => row.organizationId === organizationId);
      }
      return rows;
    },
    async insertLearningAction(row) {
      learningActions.push(row);
      return row;
    },
    async listLearningActions({ organizationId = null, caseId = null } = {}) {
      return learningActions.filter((row) => {
        if (organizationId && row.organizationId !== organizationId) {
          return false;
        }
        if (caseId && row.caseId !== caseId) {
          return false;
        }
        return true;
      });
    },
    recordAudit(entry) {
      audits.push(entry);
    }
  };
}

module.exports = {
  createMemoryStore
};
