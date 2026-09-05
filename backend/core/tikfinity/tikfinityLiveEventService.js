/**
 * TikFinity → Atlas TikTok LIVE attribution bridge (BR-230, Phase 1).
 *
 * Records engagement only. Does not create prospects, start Recruit AI,
 * send WhatsApp, or infer tenant from username.
 */

const crypto = require("crypto");

const COMPONENT = "tikfinity_live_bridge";
const ALLOWED_COMMANDS = Object.freeze(["IUL", "TRABAJO"]);
const ALLOWED_COMMAND_SET = new Set(ALLOWED_COMMANDS);
const DEDUPE_WINDOW_MS = 20_000;
const SOURCE = "TIKTOK_LIVE";
const PLATFORM = "tiktok";
const EVENT_TYPE = "command";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_HEADER = "x-tikfinity-secret";

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

function normalizeCommand(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }
  const token = text.split(/\s+/)[0].replace(/^[/\\?#]+/, "");
  if (!token) {
    return null;
  }
  return token.toUpperCase();
}

function isAllowedCommand(command) {
  return ALLOWED_COMMAND_SET.has(command);
}

function secretsMatch(provided, expected) {
  if (!provided || !expected) {
    return false;
  }
  const providedHash = crypto.createHash("sha256").update(String(provided)).digest();
  const expectedHash = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function logStage(stage, fields = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: COMPONENT,
      stage,
      organizationId: fields.organizationId || null,
      command: fields.command || null,
      username: fields.username || null,
      campaign: fields.campaign || null,
      funnel: fields.funnel || null,
      reason: fields.reason || null
    })
  );
}

function collectLiveEventInput(req = {}) {
  const query = req.query && typeof req.query === "object" ? req.query : {};
  const body =
    req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) ? req.body : {};
  const headerSecret =
    typeof req.get === "function" ? req.get(SECRET_HEADER) : req.headers?.[SECRET_HEADER];

  const value1 = firstNonEmpty(query.value1, body.value1);
  const value2 = firstNonEmpty(query.value2, body.value2);
  const value3 = firstNonEmpty(query.value3, body.value3);
  const explicitCommand = firstNonEmpty(query.command, body.command);
  const username = firstNonEmpty(value1, query.username, body.username);
  const command = normalizeCommand(explicitCommand || value2);

  return {
    value1,
    value2,
    value3,
    username,
    command,
    commandText: value2,
    giftName: value3,
    organizationId: firstNonEmpty(query.organizationId, body.organizationId),
    campaign: firstNonEmpty(query.campaign, body.campaign),
    funnel: firstNonEmpty(query.funnel, body.funnel),
    secret: firstNonEmpty(query.secret, headerSecret, body.secret)
  };
}

function createMemoryTiktokLiveEngagementStore(seed = []) {
  const rows = seed.slice();
  return {
    rows,
    async insert(row) {
      const created = {
        id: crypto.randomUUID(),
        created_at: row.created_at || new Date().toISOString(),
        ...row
      };
      rows.push(created);
      return created;
    },
    async findRecentDuplicate({
      organizationId,
      username,
      command,
      commandText,
      sinceIso
    }) {
      const since = Date.parse(sinceIso);
      return (
        rows.find((row) => {
          if (row.organization_id !== organizationId) {
            return false;
          }
          if (String(row.username || "") !== String(username || "")) {
            return false;
          }
          if (String(row.command || "") !== String(command || "")) {
            return false;
          }
          if (String(row.command_text || "") !== String(commandText || "")) {
            return false;
          }
          return Date.parse(row.received_at) >= since;
        }) || null
      );
    },
    async listByOrganization({ organizationId, limit }) {
      const scoped = rows.filter(
        (row) => String(row.organization_id) === String(organizationId)
      );
      return buildEngagementListPayload(organizationId, scoped, limit);
    }
  };
}

function createSupabaseEngagementStore(supabase) {
  return {
    async insert(row) {
      const { data, error } = await supabase
        .from("tiktok_live_engagements")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
    async findRecentDuplicate({
      organizationId,
      username,
      command,
      commandText,
      sinceIso
    }) {
      let query = supabase
        .from("tiktok_live_engagements")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("username", username)
        .eq("command", command)
        .gte("received_at", sinceIso)
        .limit(1);
      if (commandText) {
        query = query.eq("command_text", commandText);
      } else {
        query = query.or("command_text.is.null,command_text.eq.");
      }
      const { data, error } = await query.maybeSingle();
      if (error) {
        throw error;
      }
      return data || null;
    },
    async listByOrganization({ organizationId, limit }) {
      const { data, error } = await supabase
        .from("tiktok_live_engagements")
        .select("id, username, command, campaign, funnel, received_at")
        .eq("organization_id", organizationId)
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) {
        throw error;
      }
      return buildEngagementListPayload(organizationId, data || [], limit);
    }
  };
}

async function defaultFindOrganization(organizationId) {
  const { supabase } = require("../../services/supabaseService");
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
}

function defaultEngagementStore() {
  const { supabase } = require("../../services/supabaseService");
  return createSupabaseEngagementStore(supabase);
}

function clampListLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(100, Math.floor(parsed));
}

function emptyEngagementSummary() {
  return {
    total: 0,
    iul: 0,
    recruiting: 0,
    lastReceivedAt: null
  };
}

function toPublicEngagement(row) {
  return {
    id: row.id || null,
    username: row.username || null,
    command: row.command || null,
    campaign: row.campaign || null,
    funnel: row.funnel || null,
    receivedAt: row.received_at || row.receivedAt || null,
    status: "Captured"
  };
}

function buildEngagementListPayload(organizationId, rows, limit) {
  const scoped = Array.isArray(rows) ? rows.slice() : [];
  scoped.sort((left, right) => {
    return Date.parse(right.received_at || right.receivedAt || 0)
      - Date.parse(left.received_at || left.receivedAt || 0);
  });
  const summary = emptyEngagementSummary();
  summary.total = scoped.length;
  for (const row of scoped) {
    if (String(row.command || "").toUpperCase() === "IUL") {
      summary.iul += 1;
    }
    if (String(row.command || "").toUpperCase() === "TRABAJO") {
      summary.recruiting += 1;
    }
  }
  summary.lastReceivedAt = scoped[0]?.received_at || scoped[0]?.receivedAt || null;
  return {
    organizationId,
    summary,
    items: scoped.slice(0, clampListLimit(limit)).map(toPublicEngagement)
  };
}

/**
 * Implements BR-230 — tenant-scoped read of captured LIVE engagements.
 * Session org only. Never infers tenant from username or query.
 */
async function listTiktokLiveEngagements(
  { organizationId, limit } = {},
  dependencies = {}
) {
  if (!isUuid(organizationId)) {
    return {
      organizationId: null,
      summary: emptyEngagementSummary(),
      items: []
    };
  }

  const store = dependencies.engagementStore || defaultEngagementStore();
  try {
    return await store.listByOrganization({
      organizationId,
      limit: clampListLimit(limit)
    });
  } catch {
    const error = new Error("ENGAGEMENT_LIST_FAILED");
    error.statusCode = 500;
    error.publicCode = "ENGAGEMENT_LIST_FAILED";
    throw error;
  }
}

async function recordTikfinityLiveEvent(req, dependencies = {}) {
  const env = dependencies.env || process.env;
  const nowMs = dependencies.nowMs || Date.now();
  const input = collectLiveEventInput(req);
  const expectedSecret = String(env.TIKFINITY_WEBHOOK_SECRET || "").trim();

  logStage("webhook_received", {
    organizationId: input.organizationId,
    command: input.command,
    username: input.username,
    campaign: input.campaign,
    funnel: input.funnel
  });

  if (!secretsMatch(input.secret, expectedSecret)) {
    logStage("webhook_rejected", {
      organizationId: input.organizationId,
      command: input.command,
      username: input.username,
      campaign: input.campaign,
      funnel: input.funnel,
      reason: "UNAUTHORIZED"
    });
    return { status: 401, body: { ok: false, error: "UNAUTHORIZED" } };
  }

  if (!input.organizationId) {
    logStage("webhook_rejected", {
      command: input.command,
      username: input.username,
      campaign: input.campaign,
      funnel: input.funnel,
      reason: "ORGANIZATION_REQUIRED"
    });
    return { status: 400, body: { ok: false, error: "ORGANIZATION_REQUIRED" } };
  }

  if (!isUuid(input.organizationId)) {
    logStage("webhook_rejected", {
      organizationId: input.organizationId,
      command: input.command,
      username: input.username,
      campaign: input.campaign,
      funnel: input.funnel,
      reason: "ORGANIZATION_INVALID"
    });
    return { status: 400, body: { ok: false, error: "ORGANIZATION_INVALID" } };
  }

  const findOrganization = dependencies.findOrganization || defaultFindOrganization;
  let organization = null;
  try {
    organization = await findOrganization(input.organizationId);
  } catch {
    logStage("webhook_rejected", {
      organizationId: input.organizationId,
      command: input.command,
      username: input.username,
      campaign: input.campaign,
      funnel: input.funnel,
      reason: "ORGANIZATION_LOOKUP_FAILED"
    });
    return { status: 400, body: { ok: false, error: "ORGANIZATION_INVALID" } };
  }

  if (!organization?.id) {
    logStage("webhook_rejected", {
      organizationId: input.organizationId,
      command: input.command,
      username: input.username,
      campaign: input.campaign,
      funnel: input.funnel,
      reason: "ORGANIZATION_NOT_FOUND"
    });
    return { status: 404, body: { ok: false, error: "ORGANIZATION_NOT_FOUND" } };
  }

  if (!input.username) {
    logStage("webhook_rejected", {
      organizationId: input.organizationId,
      command: input.command,
      campaign: input.campaign,
      funnel: input.funnel,
      reason: "USERNAME_REQUIRED"
    });
    return { status: 400, body: { ok: false, error: "USERNAME_REQUIRED" } };
  }

  if (!input.command || !isAllowedCommand(input.command)) {
    logStage("webhook_rejected", {
      organizationId: input.organizationId,
      command: input.command,
      username: input.username,
      campaign: input.campaign,
      funnel: input.funnel,
      reason: "UNKNOWN_COMMAND"
    });
    return { status: 400, body: { ok: false, error: "UNKNOWN_COMMAND" } };
  }

  const store = dependencies.engagementStore || defaultEngagementStore();
  const receivedAt = new Date(nowMs).toISOString();
  const sinceIso = new Date(nowMs - DEDUPE_WINDOW_MS).toISOString();

  let duplicate = null;
  try {
    duplicate = await store.findRecentDuplicate({
      organizationId: organization.id,
      username: input.username,
      command: input.command,
      commandText: input.commandText,
      sinceIso
    });
  } catch {
    return { status: 500, body: { ok: false, error: "ENGAGEMENT_LOOKUP_FAILED" } };
  }

  if (duplicate) {
    logStage("duplicate_suppressed", {
      organizationId: organization.id,
      command: input.command,
      username: input.username,
      campaign: input.campaign,
      funnel: input.funnel
    });
    return { status: 200, body: { ok: true, recorded: false, duplicate: true } };
  }

  const row = {
    organization_id: organization.id,
    platform: PLATFORM,
    source: SOURCE,
    event_type: EVENT_TYPE,
    username: input.username,
    command: input.command,
    command_text: input.commandText,
    gift_name: input.giftName,
    campaign: input.campaign,
    funnel: input.funnel,
    received_at: receivedAt,
    raw_metadata: {
      value1: input.value1,
      value2: input.value2,
      value3: input.value3
    }
  };

  try {
    await store.insert(row);
  } catch {
    return { status: 500, body: { ok: false, error: "ENGAGEMENT_WRITE_FAILED" } };
  }

  logStage("engagement_recorded", {
    organizationId: organization.id,
    command: input.command,
    username: input.username,
    campaign: input.campaign,
    funnel: input.funnel
  });

  return { status: 200, body: { ok: true, recorded: true } };
}

module.exports = {
  ALLOWED_COMMANDS,
  COMPONENT,
  DEDUPE_WINDOW_MS,
  EVENT_TYPE,
  PLATFORM,
  SECRET_HEADER,
  SOURCE,
  collectLiveEventInput,
  createMemoryTiktokLiveEngagementStore,
  emptyEngagementSummary,
  isAllowedCommand,
  listTiktokLiveEngagements,
  normalizeCommand,
  recordTikfinityLiveEvent,
  secretsMatch
};
