/**
 * Shared in-memory prospects.workflow_state mock with atomic || merge.
 * Emulates migration 034 merge_prospect_workflow_state for unit tests.
 */

"use strict";

function createAtomicWorkflowStateDb({
  phone,
  prospectId,
  organizationId,
  initialState = {}
}) {
  let row = {
    id: prospectId,
    phone,
    organization_id: organizationId,
    workflow_state: { ...initialState }
  };

  const events = [];
  let mergeLock = Promise.resolve();

  async function withMergeLock(fn) {
    const run = mergeLock.then(fn, fn);
    mergeLock = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function findById(id, orgId) {
    if (id !== prospectId || String(orgId) !== String(organizationId)) {
      return null;
    }
    return {
      id: row.id,
      phone: row.phone,
      organization_id: row.organization_id,
      workflow_state: { ...(row.workflow_state || {}) }
    };
  }

  const supabaseClient = {
    async rpc(name, args = {}) {
      if (name !== "merge_prospect_workflow_state") {
        return { data: null, error: new Error(`unknown rpc ${name}`) };
      }
      return withMergeLock(async () => {
        if (
          String(args.p_prospect_id) !== String(prospectId) ||
          String(args.p_organization_id) !== String(organizationId)
        ) {
          return { data: null, error: null };
        }
        const patch = args.p_patch || {};
        row.workflow_state = {
          ...(row.workflow_state || {}),
          ...patch
        };
        events.push({
          type: "merge",
          keys: Object.keys(patch)
        });
        return { data: { ...row.workflow_state }, error: null };
      });
    },
    from() {
      return {
        update(payload) {
          return {
            eq() {
              return this;
            },
            select() {
              return this;
            },
            async maybeSingle() {
              row.workflow_state = { ...(payload.workflow_state || {}) };
              events.push({ type: "replace" });
              return {
                data: {
                  id: row.id,
                  organization_id: row.organization_id,
                  phone: row.phone,
                  workflow_state: { ...row.workflow_state }
                },
                error: null
              };
            }
          };
        }
      };
    }
  };

  return {
    phone,
    prospectId,
    organizationId,
    events,
    findById,
    supabaseClient,
    scope(extra = {}) {
      return {
        organizationId,
        prospectId,
        backend: "database",
        findProspectByIdFn: findById,
        supabaseClient,
        ...extra
      };
    },
    snapshot() {
      return { ...(row.workflow_state || {}) };
    },
    getRow() {
      return row;
    }
  };
}

module.exports = {
  createAtomicWorkflowStateDb
};
