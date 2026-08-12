/**
 * In-memory QR Channel repository for unit tests.
 */

const crypto = require("crypto");
const { OPEN_SCAN_STATUSES, SCAN_STATUS } = require("./constants");

function nowIso() {
  return new Date().toISOString();
}

function createMemoryQrChannelRepository() {
  const campaigns = new Map();
  const scans = new Map();

  return {
    async findCampaignByTokenHash(tokenHash) {
      for (const c of campaigns.values()) {
        if (c.public_token_hash === tokenHash) {
          return { ...c };
        }
      }
      return null;
    },

    async findCampaignByOrgAndKey(orgId, campaignKey) {
      for (const c of campaigns.values()) {
        if (c.org_id === orgId && c.campaign_key === campaignKey) {
          return { ...c };
        }
      }
      return null;
    },

    async findCampaignById(id) {
      const c = campaigns.get(id);
      return c ? { ...c } : null;
    },

    async insertCampaign(row) {
      const id = row.id || crypto.randomUUID();
      const record = {
        ...row,
        id,
        created_at: row.created_at || nowIso(),
        updated_at: row.updated_at || nowIso()
      };
      campaigns.set(id, record);
      return { ...record };
    },

    async updateCampaign(id, patch) {
      const existing = campaigns.get(id);
      if (!existing) return null;
      const next = {
        ...existing,
        ...patch,
        updated_at: nowIso()
      };
      campaigns.set(id, next);
      return { ...next };
    },

    async findScanById(id) {
      const s = scans.get(id);
      return s ? { ...s } : null;
    },

    async insertScan(row) {
      const id = row.id || crypto.randomUUID();
      const record = {
        ...row,
        id,
        correlation_id: row.correlation_id || crypto.randomUUID(),
        created_at: row.created_at || nowIso(),
        updated_at: row.updated_at || nowIso()
      };
      scans.set(id, record);
      return { ...record };
    },

    async updateScan(id, patch) {
      const existing = scans.get(id);
      if (!existing) return null;
      const next = {
        ...existing,
        ...patch,
        updated_at: nowIso()
      };
      scans.set(id, next);
      return { ...next };
    },

    async listOpenScansForOrgPhone(orgId, phoneNormalized) {
      const out = [];
      for (const s of scans.values()) {
        if (
          s.org_id === orgId &&
          s.bound_phone_normalized === phoneNormalized &&
          OPEN_SCAN_STATUSES.includes(s.status)
        ) {
          out.push({ ...s });
        }
      }
      return out;
    },

    async listPendingInboundScansForOrgPhone(orgId, phoneNormalized) {
      const out = [];
      for (const s of scans.values()) {
        if (
          s.org_id === orgId &&
          s.bound_phone_normalized === phoneNormalized &&
          s.status === SCAN_STATUS.PENDING_INBOUND &&
          !s.consumed_at
        ) {
          out.push({ ...s });
        }
      }
      return out;
    },

    async markScansAmbiguousConflict(scanIds = []) {
      let count = 0;
      for (const id of scanIds || []) {
        const s = scans.get(id);
        if (s && s.status === SCAN_STATUS.PENDING_INBOUND) {
          scans.set(id, {
            ...s,
            status: SCAN_STATUS.AMBIGUOUS_CONFLICT,
            updated_at: nowIso()
          });
          count += 1;
        }
      }
      return count;
    },

    async supersedeOpenScansExcept({ orgId, phoneNormalized, exceptScanId }) {
      let count = 0;
      for (const [id, s] of scans.entries()) {
        if (
          s.org_id === orgId &&
          s.bound_phone_normalized === phoneNormalized &&
          OPEN_SCAN_STATUSES.includes(s.status) &&
          id !== exceptScanId
        ) {
          scans.set(id, {
            ...s,
            status: SCAN_STATUS.SUPERSEDED,
            updated_at: nowIso()
          });
          count += 1;
        }
      }
      return count;
    },

    /** Test helpers */
    _dump() {
      return {
        campaigns: [...campaigns.values()],
        scans: [...scans.values()]
      };
    },
    _clear() {
      campaigns.clear();
      scans.clear();
    }
  };
}

module.exports = {
  createMemoryQrChannelRepository
};
