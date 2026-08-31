/**
 * BR-178 — in-memory follow-up store for synthetic tests.
 */

function createMemoryFollowUpStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, { ...row, history: [...(row.history || [])] }]));

  return {
    async upsert(row) {
      const existing = [...rows.values()].find(
        (item) =>
          item.organizationId === row.organizationId && item.dedupKey === row.dedupKey
      );
      const saved = {
        ...(existing || {}),
        ...row,
        id: existing?.id || row.id,
        createdAt: existing?.createdAt || row.createdAt,
        history: row.history || existing?.history || []
      };
      rows.set(saved.id, saved);
      return { ...saved, history: [...saved.history] };
    },

    async findById(id, organizationId) {
      const row = rows.get(id);
      if (!row) {
        return null;
      }
      if (organizationId && row.organizationId !== organizationId) {
        return null;
      }
      return { ...row, history: [...(row.history || [])] };
    },

    async findByDedupKey(organizationId, dedupKey) {
      const row = [...rows.values()].find(
        (item) => item.organizationId === organizationId && item.dedupKey === dedupKey
      );
      return row ? { ...row, history: [...(row.history || [])] } : null;
    },

    async listOpenByAppointment(organizationId, appointmentId) {
      return [...rows.values()]
        .filter(
          (item) =>
            item.organizationId === organizationId &&
            item.status === "OPEN" &&
            String(item.sourceEvent || "").startsWith("outcome:") &&
            item.appointmentId === appointmentId
        )
        .map((item) => ({ ...item, history: [...(item.history || [])] }));
    },

    async listOpenForProspect(organizationId, { prospectId = null, subjectPhone = null } = {}) {
      const { isProspectLinkedFollowUp } = require("./prospectClosePolicy");
      return [...rows.values()]
        .filter(
          (item) =>
            item.organizationId === organizationId &&
            item.status === "OPEN" &&
            isProspectLinkedFollowUp(item, { prospectId, subjectPhone })
        )
        .map((item) => ({ ...item, history: [...(item.history || [])] }));
    },

    async listForOwners({ organizationId, ownerUserIds, statuses }) {
      const owners = new Set((ownerUserIds || []).map((id) => String(id)));
      return [...rows.values()]
        .filter((item) => item.organizationId === organizationId)
        .filter((item) => !owners.size || owners.has(String(item.ownerUserId)))
        .filter((item) => !statuses?.length || statuses.includes(item.status))
        .map((item) => ({ ...item, history: [...(item.history || [])] }));
    }
  };
}

module.exports = {
  createMemoryFollowUpStore
};
