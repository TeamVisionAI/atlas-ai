/**
 * Duplicate first-reply recovery — reconstruct canonical recruiting intake context
 * from durable evidence only (no fabricated CTWA / eligibility).
 *
 * Implements BR-142 + BR-147 recovery parity with normal first-turn processing.
 */

const { loadPersistedWorkflowState } = require("./workflowStateStore");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { stripCampaignIntakeToken } = require("./campaignIntakeCode/intakeCodeToken");
const {
  isRecruitingPurpose,
  evaluateFreshIntakeEpisode
} = require("./campaignIntakeCode/campaignIntakeAttributionService");
const {
  extractClickToWhatsAppReferral
} = require("../services/whatsappWebhookParser");
const observabilityRepository = require("../repositories/whatsappInboundWebhookObservabilityRepository");

function evaluateStalledFirstReplyRecoveryEpisode({ prospect, workflowState } = {}) {
  const wf = workflowState && typeof workflowState === "object" ? workflowState : {};

  if (wf.inboxClosedAt || wf.inboxArchivedAt) {
    return { allowed: false, reason: "CONVERSATION_CLOSED_OR_ARCHIVED" };
  }
  if (wf.manualAgentOwnership === true || Boolean(wf.humanTakenOverAt)) {
    return { allowed: false, reason: "HUMAN_OWNED" };
  }

  const terminal = evaluateFreshIntakeEpisode({
    prospect,
    workflowState: wf,
    created: false
  });
  if (!terminal.allowed && terminal.reason === "HUMAN_OWNED") {
    return terminal;
  }

  return { allowed: true, reason: "STALLED_FIRST_REPLY_RECOVERY" };
}

function matchFromAttributionRow(attribution) {
  if (!attribution) {
    return null;
  }

  const recruitingEligible =
    String(attribution.eligibilityDecision || "").toUpperCase() === "CAMPAIGN_INTAKE_CODE" ||
    attribution.metadata?.recruitingEligible === true;

  return {
    matched: true,
    code: attribution.matchedCode,
    campaignIntakeCodeId: attribution.campaignIntakeCodeId,
    campaignName: attribution.campaignName,
    purpose: attribution.purpose,
    ownerUserId: attribution.ownerUserId || null,
    organizationId: attribution.organizationId,
    whatsappPhoneNumberId: attribution.phoneNumberId,
    language: attribution.metadata?.language || null,
    status: "ACTIVE",
    recruitingEligible,
    reason: "DURABLE_ATTRIBUTION",
    evidenceSource: "campaign_intake_attributions"
  };
}

function extractCtwaReferralFromObservabilityRow(observabilityRow) {
  if (!observabilityRow) {
    return null;
  }

  if (!observabilityRow.has_referral && !observabilityRow.has_ctwa_clid) {
    return null;
  }

  const message = observabilityRow.payload?.value?.messages?.[0];
  const referral = extractClickToWhatsAppReferral(message);
  if (!referral) {
    return null;
  }

  return {
    ...referral,
    evidenceSource: "whatsapp_inbound_webhook_observability"
  };
}

function extractCtwaReferralFromRawWebhookPayload(rawWebhookPayload) {
  if (!rawWebhookPayload || typeof rawWebhookPayload !== "object") {
    return null;
  }

  const message = rawWebhookPayload?.message;
  return extractClickToWhatsAppReferral(message);
}

function resolvePhoneNumberId(inbound, observabilityRow, attribution) {
  return (
    inbound.phoneNumberId ||
    inbound.rawValue?.metadata?.phone_number_id ||
    observabilityRow?.phone_number_id ||
    attribution?.phoneNumberId ||
    null
  );
}

function resolveWabaId(inbound, observabilityRow) {
  return inbound.wabaId || observabilityRow?.waba_id || null;
}

/**
 * Load durable evidence for a stalled first-reply recovery attempt.
 */
async function loadDurableInboundRecoveryEvidence({
  providerMessageId,
  organizationId,
  prospectPhone,
  dependencies = {}
} = {}) {
  const wamid = String(providerMessageId || "").trim();
  if (!wamid) {
    return { ok: false, reason: "MISSING_PROVIDER_MESSAGE_ID" };
  }

  const intakeRepository =
    dependencies.campaignIntakeRepository ||
    dependencies.intakeService?.repository ||
    null;

  let attribution = null;
  if (intakeRepository?.getAttributionByProviderMessageId) {
    attribution = await intakeRepository.getAttributionByProviderMessageId({
      organizationId,
      providerMessageId: wamid
    });
  }

  const observabilityRepo = dependencies.observabilityRepository || observabilityRepository;
  const observabilityRow = observabilityRepo.findByProviderMessageId
    ? await observabilityRepo.findByProviderMessageId(wamid)
    : null;

  let workflowState = null;
  if (prospectPhone) {
    workflowState = await loadPersistedWorkflowState(prospectPhone, {
      organizationId: organizationId || null
    }).catch(() => null);
  }

  return {
    ok: true,
    providerMessageId: wamid,
    attribution,
    observabilityRow,
    workflowState
  };
}

/**
 * Build canonical inbound automation context for stalled first-reply recovery.
 * Fail-closed when durable verified proof is missing.
 */
async function buildStalledFirstReplyRecoveryContext({
  inbound,
  prospect,
  organizationId,
  intakeService,
  dependencies = {}
} = {}) {
  const providerMessageId = String(inbound?.providerMessageId || "").trim();
  const body = inbound.body || `[${inbound.messageType} message]`;

  const evidence = await loadDurableInboundRecoveryEvidence({
    providerMessageId,
    organizationId,
    prospectPhone: prospect?.phone || inbound.phone,
    dependencies: {
      ...dependencies,
      intakeService
    }
  });

  if (!evidence.ok) {
    return { ok: false, reason: evidence.reason || "EVIDENCE_LOAD_FAILED" };
  }

  const { attribution, observabilityRow, workflowState } = evidence;
  const phoneNumberId = resolvePhoneNumberId(inbound, observabilityRow, attribution);
  const wabaId = resolveWabaId(inbound, observabilityRow);

  let connectionSource =
    inbound.whatsappConnectionSource || inbound.organizationSource || null;
  if (!connectionSource && phoneNumberId) {
    try {
      const {
        resolveWhatsAppInboundOrganizationId
      } = require("./whatsappInboundOrganizationResolver");
      const resolved = await resolveWhatsAppInboundOrganizationId({
        phoneNumberId,
        wabaId
      });
      connectionSource = resolved?.source || null;
    } catch {
      connectionSource = null;
    }
  }

  if (organizationId && phoneNumberId && attribution?.organizationId) {
    if (String(attribution.organizationId) !== String(organizationId)) {
      return { ok: false, reason: "ORG_MISMATCH" };
    }
  }

  let campaignIntakeMatch = matchFromAttributionRow(attribution);
  let intakeEvidenceSource = campaignIntakeMatch?.evidenceSource || null;
  const ctwaReferralFromObs = extractCtwaReferralFromObservabilityRow(observabilityRow);
  const hasVerifiedCtwaEarly = Boolean(
    ctwaReferralFromObs || extractCtwaReferralFromRawWebhookPayload(inbound.rawWebhookPayload)
  );

  if (!campaignIntakeMatch?.matched) {
    const hasDurableInboundProof = Boolean(observabilityRow || attribution);
    if (!hasDurableInboundProof) {
      return { ok: false, reason: "NO_DURABLE_INBOUND_EVIDENCE" };
    }

    const lookup = hasDurableInboundProof
      ? await intakeService.lookupInboundMatch({
          organizationId,
          whatsappPhoneNumberId: phoneNumberId,
          messageBody: body
        })
      : null;

    if (lookup?.matched) {
      const episode = evaluateStalledFirstReplyRecoveryEpisode({
        prospect,
        workflowState
      });
      if (!episode.allowed) {
        return { ok: false, reason: episode.reason };
      }

      campaignIntakeMatch = {
        ...lookup,
        recruitingEligible: isRecruitingPurpose(lookup) && episode.allowed,
        reason: "DURABLE_OBSERVABILITY_INTAKE",
        evidenceSource: observabilityRow
          ? "whatsapp_inbound_webhook_observability"
          : "campaign_intake_attributions"
      };
      intakeEvidenceSource = campaignIntakeMatch.evidenceSource;
    } else if (!hasVerifiedCtwaEarly) {
      return { ok: false, reason: lookup?.reason || "INTAKE_NOT_VERIFIED" };
    }
  }

  const ctwaReferral =
    ctwaReferralFromObs ||
    extractCtwaReferralFromRawWebhookPayload(inbound.rawWebhookPayload) ||
    inbound.ctwaReferral ||
    null;

  const semanticBody = campaignIntakeMatch?.matched
    ? stripCampaignIntakeToken(body, campaignIntakeMatch.code)
    : body;

  const inboundForAutomation = {
    ...inbound,
    body: semanticBody,
    phoneNumberId,
    wabaId,
    ctwaReferral,
    campaignIntakeMatch: campaignIntakeMatch?.matched ? campaignIntakeMatch : null,
    whatsappConnectionSource: connectionSource,
    rawValue: {
      ...(inbound.rawValue || {}),
      metadata: {
        ...(inbound.rawValue?.metadata || {}),
        phone_number_id: phoneNumberId
      }
    }
  };

  const { VERIFIED_SOURCE_SET } = require("./atlasInboundAutomationEligibility");
  const hasVerifiedIntake =
    campaignIntakeMatch?.matched && campaignIntakeMatch.recruitingEligible === true;
  const hasVerifiedCtwa = Boolean(ctwaReferral);
  const storedEligibility = String(workflowState?.atlasEligibilitySource || "")
    .trim()
    .toUpperCase();
  const hasVerifiedStoredEligibility = VERIFIED_SOURCE_SET.has(storedEligibility);

  if (
    !hasVerifiedIntake &&
    !hasVerifiedCtwa &&
    !hasVerifiedStoredEligibility
  ) {
    return { ok: false, reason: "NO_VERIFIED_ELIGIBILITY_EVIDENCE" };
  }

  logWhatsAppStage("inbound_first_reply_recovery_context_built", {
    phone: prospect?.phone || inbound.phone || null,
    providerMessageId,
    organizationId: organizationId || null,
    intakeEvidenceSource,
    hasCtwaReferral: hasVerifiedCtwa,
    recruitingEligible: campaignIntakeMatch?.recruitingEligible === true,
    atlasEligibilitySource: storedEligibility || null
  });

  return {
    ok: true,
    inboundForAutomation,
    campaignIntakeMatch,
    ctwaReferral,
    phoneNumberId,
    wabaId,
    workflowState,
    attribution,
    observabilityRow,
    evidenceSource: intakeEvidenceSource
  };
}

/**
 * Restore durable recruiting attribution/workflow state before hub (idempotent).
 */
async function restoreStalledFirstReplyRecruitingState({
  intakeService,
  campaignIntakeMatch,
  prospect,
  organizationId,
  providerMessageId,
  phoneNumberId,
  workflowState,
  attribution,
  ctwaReferral = null,
  whatsappConnectionSource = null
}) {
  if (campaignIntakeMatch?.matched && prospect?.phone) {
    if (attribution) {
      return intakeService.reconcileStalledFirstReplyAttributionState({
        match: campaignIntakeMatch,
        prospect,
        organizationId,
        providerMessageId,
        phoneNumberId,
        workflowState,
        attribution
      });
    }

    const episode = evaluateStalledFirstReplyRecoveryEpisode({
      prospect,
      workflowState
    });
    if (!episode.allowed) {
      return { ok: false, reason: episode.reason };
    }

    return intakeService.establishInboundAttribution({
      match: {
        ...campaignIntakeMatch,
        recruitingEligible:
          campaignIntakeMatch.recruitingEligible === true &&
          isRecruitingPurpose(campaignIntakeMatch)
      },
      prospect,
      created: false,
      workflowState,
      providerMessageId,
      phoneNumberId,
      organizationId
    });
  }

  if (ctwaReferral && prospect?.phone) {
    const { persistVerifiedAtlasEligibilitySource, VERIFIED_ATLAS_ELIGIBILITY_SOURCES } =
      require("./atlasInboundAutomationEligibility");
    const { savePersistedWorkflowState } = require("./workflowStateStore");
    const { MILESTONES, OWNERSHIP } = require("./workflowConstants");

    const scope = {
      organizationId: organizationId || prospect.organization_id || null,
      prospectId: prospect.id || null
    };

    await persistVerifiedAtlasEligibilitySource(
      prospect.phone,
      VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CTWA_REFERRAL,
      scope
    ).catch(() => null);

    await savePersistedWorkflowState(
      prospect.phone,
      {
        canonicalMilestone: MILESTONES.NEW_LEAD,
        workflowOwnership: OWNERSHIP.ATLAS,
        manualAgentOwnership: false
      },
      scope
    ).catch(() => null);

    return { ok: true, recruitingEligible: true, eligibilityDecision: "CTWA_REFERRAL", idempotent: true };
  }

  return { ok: false, reason: "NO_MATCH" };
}

module.exports = {
  evaluateStalledFirstReplyRecoveryEpisode,
  loadDurableInboundRecoveryEvidence,
  buildStalledFirstReplyRecoveryContext,
  restoreStalledFirstReplyRecruitingState,
  matchFromAttributionRow,
  extractCtwaReferralFromObservabilityRow
};
