/**
 * IUL Follow-Up Worklist — classification, WhatsApp window, filters.
 */

"use strict";

const {
  IUL_FOLLOW_UP_FILTERS,
  IUL_STAGES,
  WHATSAPP_WINDOW_STATUS,
  RECOMMENDED_FOLLOW_UP_CHANNEL,
  isIulWorkflowProspect
} = require("./iulWorkflowConstants");
const {
  evaluateCustomerCareWindowFromInboundAt
} = require("./whatsappCustomerCareWindow");
const {
  RELATIVE_PERIODS,
  getOrganizationDateWindow
} = require("./organizationDateWindow");
const { parseFollowUpAtMs } = require("./followUpsQueueEngine");

const NEAR_EXPIRY_MS = 2 * 60 * 60 * 1000;

function parseIsoMs(value) {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function buildWhatsAppWindowFields({ latestInboundAt, now = new Date() } = {}) {
  const window = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt,
    now
  });
  const status = window.open
    ? WHATSAPP_WINDOW_STATUS.OPEN
    : WHATSAPP_WINDOW_STATUS.CLOSED;
  const recommendedFollowUpChannel = window.open
    ? RECOMMENDED_FOLLOW_UP_CHANNEL.WHATSAPP_FREEFORM
    : RECOMMENDED_FOLLOW_UP_CHANNEL.PHONE_CALL;
  const expiresMs = parseIsoMs(window.expiresAt);
  const nowMs = typeof now === "number" ? now : Date.parse(now);
  const nearExpiry =
    window.open &&
    expiresMs != null &&
    expiresMs - nowMs <= NEAR_EXPIRY_MS &&
    expiresMs - nowMs > 0;
  return {
    whatsappWindowStatus: status,
    whatsappWindowExpiresAt: window.expiresAt || null,
    latestInboundAt: window.latestInboundAt || latestInboundAt || null,
    recommendedFollowUpChannel,
    whatsappNearExpiry: nearExpiry
  };
}

function isReviewScheduledStage(stage) {
  return (
    stage === IUL_STAGES.REVIEW_SCHEDULED ||
    stage === IUL_STAGES.REVIEW_CONFIRMED
  );
}

function classifyIulFollowUpStatus({
  nextFollowUpAtMs = null,
  iulWorkflowStage = null,
  appointmentAtMs = null,
  organizationId = null,
  reference = null,
  todayWindow = null
}) {
  if (isReviewScheduledStage(iulWorkflowStage) && appointmentAtMs) {
    return IUL_FOLLOW_UP_FILTERS.REVIEW_SCHEDULED;
  }

  if (nextFollowUpAtMs == null) {
    if (iulWorkflowStage === IUL_STAGES.REVIEW_READY) {
      return IUL_FOLLOW_UP_FILTERS.WAITING_ON_PROSPECT;
    }
    return IUL_FOLLOW_UP_FILTERS.NO_FOLLOW_UP_SET;
  }

  const window =
    todayWindow ||
    getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference: reference || new Date()
    });
  const weekWindow = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.THIS_WEEK,
    reference: reference || new Date()
  });

  if (nextFollowUpAtMs < window.startMs) {
    return IUL_FOLLOW_UP_FILTERS.OVERDUE;
  }
  if (nextFollowUpAtMs >= window.startMs && nextFollowUpAtMs <= window.endMs) {
    return IUL_FOLLOW_UP_FILTERS.DUE_TODAY;
  }
  if (nextFollowUpAtMs <= weekWindow.endMs) {
    return IUL_FOLLOW_UP_FILTERS.THIS_WEEK;
  }
  return IUL_FOLLOW_UP_FILTERS.WAITING_ON_PROSPECT;
}

function daysSinceLastContact(lastContactAtMs, nowMs = Date.now()) {
  if (!lastContactAtMs) {
    return null;
  }
  return Math.floor((nowMs - lastContactAtMs) / (24 * 60 * 60 * 1000));
}

function buildIulFollowUpItem({
  prospect,
  workflowState = {},
  agentState = {},
  durableFacts = {},
  latestInboundAt = null,
  lastContactAt = null,
  appointmentAt = null,
  organizationId = null,
  reference = new Date()
} = {}) {
  if (!isIulWorkflowProspect(workflowState, durableFacts)) {
    return null;
  }

  const followUpAtMs = parseFollowUpAtMs(
    agentState.followUpDate,
    agentState.followUpTime
  );
  const appointmentAtMs = parseIsoMs(appointmentAt);
  const lastContactAtMs =
    parseIsoMs(lastContactAt) ||
    parseIsoMs(agentState.lastContactAt) ||
    parseIsoMs(prospect?.updated_at);
  const iulWorkflowStage =
    durableFacts.iulWorkflowStage ||
    workflowState.iulWorkflowStage ||
    IUL_STAGES.NEW_IUL_LEAD;
  const whatsapp = buildWhatsAppWindowFields({ latestInboundAt, now: reference });
  const status = classifyIulFollowUpStatus({
    nextFollowUpAtMs: followUpAtMs,
    iulWorkflowStage,
    appointmentAtMs,
    organizationId,
    reference,
    todayWindow: null
  });

  return {
    phone: prospect?.phone || null,
    name: prospect?.name || null,
    email: prospect?.email || durableFacts.email || null,
    ownerUserId: prospect?.owner_user_id || workflowState.ownerUserId || null,
    campaign:
      workflowState.campaignIntakeCampaignName ||
      durableFacts.campaignName ||
      null,
    campaignIntakeCodeId:
      workflowState.campaignIntakeCodeId || durableFacts.campaignIntakeCodeId || null,
    iulStage: iulWorkflowStage,
    originalPolicyPurpose:
      durableFacts.originalPolicyPurpose || workflowState.originalPolicyPurpose || null,
    reviewReason: durableFacts.reviewReason || workflowState.reviewReason || null,
    lastInboundAt: whatsapp.latestInboundAt,
    lastContactAt: lastContactAtMs ? new Date(lastContactAtMs).toISOString() : null,
    nextFollowUpAt: followUpAtMs ? new Date(followUpAtMs).toISOString() : null,
    followUpStatus: status,
    appointmentAt: appointmentAtMs ? new Date(appointmentAtMs).toISOString() : null,
    notes: agentState.outcome || workflowState.iulOutcome || null,
    daysSinceLastContact: daysSinceLastContact(lastContactAtMs, Date.parse(reference)),
    whatsappWindowStatus: whatsapp.whatsappWindowStatus,
    whatsappWindowExpiresAt: whatsapp.whatsappWindowExpiresAt,
    recommendedFollowUpChannel: whatsapp.recommendedFollowUpChannel,
    whatsappNearExpiry: whatsapp.whatsappNearExpiry
  };
}

function matchesIulFilter(item, filter) {
  if (!filter || filter === IUL_FOLLOW_UP_FILTERS.ALL) {
    return true;
  }
  return item.followUpStatus === filter;
}

function compareIulFollowUpItems(a, b) {
  if (a.whatsappNearExpiry !== b.whatsappNearExpiry) {
    return a.whatsappNearExpiry ? -1 : 1;
  }
  const aDue = parseIsoMs(a.nextFollowUpAt) || Number.MAX_SAFE_INTEGER;
  const bDue = parseIsoMs(b.nextFollowUpAt) || Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) {
    return aDue - bDue;
  }
  return String(a.name || a.phone || "").localeCompare(String(b.name || b.phone || ""));
}

function buildIulFilterCounts(items = []) {
  const counts = { all: items.length };
  for (const value of Object.values(IUL_FOLLOW_UP_FILTERS)) {
    if (value === IUL_FOLLOW_UP_FILTERS.ALL) {
      continue;
    }
    counts[value] = items.filter((item) => item.followUpStatus === value).length;
  }
  counts.nearExpiry = items.filter((item) => item.whatsappNearExpiry).length;
  return counts;
}

function rowsToCsv(rows = []) {
  if (!rows.length) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const raw = value == null ? "" : String(value);
    if (/[",\n]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))
  ].join("\n");
}

module.exports = {
  IUL_FOLLOW_UP_FILTERS,
  NEAR_EXPIRY_MS,
  buildWhatsAppWindowFields,
  classifyIulFollowUpStatus,
  buildIulFollowUpItem,
  matchesIulFilter,
  compareIulFollowUpItems,
  buildIulFilterCounts,
  rowsToCsv,
  isIulWorkflowProspect
};
