/**
 * BR-147 — Inbound campaign intake matching, episode gating, and audit.
 */

const { INTAKE_CODE_STATUS } = require("./constants");
const { extractCampaignIntakeToken } = require("./intakeCodeToken");
const { evaluateRecruitingSessionActive } = require("../recruitingSessionGuard");
const {
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES,
  persistVerifiedAtlasEligibilitySource
} = require("../atlasInboundAutomationEligibility");
const { savePersistedWorkflowState } = require("../workflowStateStore");
const { MILESTONES, OWNERSHIP } = require("../workflowConstants");
const { IUL_STAGES, isIulReviewPurpose, IUL_CONVERSATION_GOAL, IUL_CAMPAIGN_KIND } = require("../iulWorkflowConstants");

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function mapMatchRecord(record) {
  if (!record) return null;
  return {
    matched: true,
    code: record.code,
    campaignIntakeCodeId: record.id,
    campaignName: record.campaignName,
    purpose: record.purpose,
    ownerUserId: record.ownerUserId,
    organizationId: record.organizationId,
    whatsappPhoneNumberId: record.whatsappPhoneNumberId,
    language: record.language || null,
    status: record.status
  };
}

function isRecruitingPurpose(match) {
  return upper(match?.purpose) === "RECRUITING";
}

function evaluateFreshIntakeEpisode({ prospect, workflowState, created }) {
  if (created) {
    return { allowed: true, reason: "NEW_PROSPECT" };
  }

  const wf = workflowState && typeof workflowState === "object" ? workflowState : {};
  if (wf.inboxClosedAt || wf.inboxArchivedAt) {
    return { allowed: false, reason: "CONVERSATION_CLOSED_OR_ARCHIVED" };
  }
  if (wf.manualAgentOwnership === true || Boolean(wf.humanTakenOverAt)) {
    return { allowed: false, reason: "HUMAN_OWNED" };
  }

  const session = evaluateRecruitingSessionActive({ prospect, workflowState: wf });
  if (session.active) {
    return { allowed: false, reason: "ACTIVE_SESSION_EXISTS" };
  }

  return { allowed: true, reason: "NEW_INTAKE_EPISODE" };
}

function createCampaignIntakeAttributionService(options = {}) {
  const {
    createCampaignIntakeCodeRepository
  } = require("./campaignIntakeCodeRepository");
  const repository =
    options.repository || createCampaignIntakeCodeRepository(options);

  async function lookupInboundMatch({
    organizationId,
    whatsappPhoneNumberId,
    messageBody
  } = {}) {
    const token = extractCampaignIntakeToken(messageBody);
    if (!token || !organizationId || !whatsappPhoneNumberId) {
      return { matched: false, reason: "NO_TOKEN" };
    }

    const record = await repository.getByCode({
      organizationId,
      whatsappPhoneNumberId,
      code: token
    });

    if (!record) {
      return { matched: false, reason: "CODE_NOT_FOUND", token };
    }

    if (record.status === INTAKE_CODE_STATUS.RETIRED) {
      return { matched: false, reason: "CODE_RETIRED", token, record };
    }
    if (record.status === INTAKE_CODE_STATUS.PAUSED) {
      return { matched: false, reason: "CODE_PAUSED", token, record };
    }
    if (record.status !== INTAKE_CODE_STATUS.ACTIVE) {
      return { matched: false, reason: "CODE_INACTIVE", token, record };
    }

    return {
      matched: true,
      ...mapMatchRecord(record),
      reason: "MATCHED"
    };
  }

  async function resolveInboundCampaignIntakeMatch({
    organizationId,
    whatsappPhoneNumberId,
    messageBody,
    prospect = null,
    created = false,
    workflowState = null
  } = {}) {
    const lookup = await lookupInboundMatch({
      organizationId,
      whatsappPhoneNumberId,
      messageBody
    });
    if (!lookup.matched) {
      return lookup;
    }

    let recruitingEligible = false;
    if (isRecruitingPurpose(lookup)) {
      if (created) {
        recruitingEligible = true;
      } else {
        const episode = evaluateFreshIntakeEpisode({
          prospect,
          workflowState,
          created: false
        });
        recruitingEligible = episode.allowed;
      }
    }

    let iulReviewEligible = false;
    if (isIulReviewPurpose(lookup)) {
      if (created) {
        iulReviewEligible = true;
      } else {
        const episode = evaluateFreshIntakeEpisode({
          prospect,
          workflowState,
          created: false
        });
        iulReviewEligible = episode.allowed;
      }
    }

    return {
      ...lookup,
      recruitingEligible,
      iulReviewEligible
    };
  }

  async function establishInboundAttribution({
    match,
    prospect,
    created = false,
    workflowState = null,
    providerMessageId = null,
    phoneNumberId = null,
    organizationId = null
  } = {}) {
    if (!match?.matched) {
      return { ok: false, reason: match?.reason || "NO_MATCH" };
    }

    const episode = evaluateFreshIntakeEpisode({
      prospect,
      workflowState,
      created
    });

    const recruitingEligible =
      isRecruitingPurpose(match) && episode.allowed;

    const eligibilityDecision = recruitingEligible
      ? "CAMPAIGN_INTAKE_CODE"
      : isRecruitingPurpose(match)
        ? episode.reason
        : "NON_RECRUITING_PURPOSE";

    let attribution = null;
    if (providerMessageId && organizationId) {
      const result = await repository.insertAttribution({
        organization_id: organizationId,
        campaign_intake_code_id: match.campaignIntakeCodeId,
        prospect_id: prospect?.id || null,
        prospect_phone: prospect?.phone || null,
        provider_message_id: providerMessageId,
        phone_number_id: phoneNumberId,
        matched_code: match.code,
        campaign_name: match.campaignName,
        purpose: match.purpose,
        owner_user_id: match.ownerUserId || null,
        eligibility_decision: eligibilityDecision,
        metadata: {
          episodeReason: episode.reason,
          recruitingEligible
        }
      });
      attribution = result.row;
    }

    if (recruitingEligible && prospect?.phone) {
      const scope = {
        organizationId: organizationId || prospect.organization_id || null,
        prospectId: prospect.id || null
      };
      await persistVerifiedAtlasEligibilitySource(
        prospect.phone,
        VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_CODE,
        scope
      ).catch(() => null);
      await savePersistedWorkflowState(
        prospect.phone,
        {
          campaignIntakeCodeId: match.campaignIntakeCodeId,
          campaignIntakeCampaignName: match.campaignName,
          campaignIntakePurpose: match.purpose,
          campaignIntakeMatchedAt: new Date().toISOString(),
          canonicalMilestone: MILESTONES.NEW_LEAD,
          workflowOwnership: OWNERSHIP.ATLAS
        },
        scope
      ).catch(() => null);
    }

    // IUL review intake — route to policy_review track; never Recruit AI (BR-142).
    if (isIulReviewPurpose(match) && prospect?.phone && episode.allowed) {
      const scope = {
        organizationId: organizationId || prospect.organization_id || null,
        prospectId: prospect.id || null
      };
      await savePersistedWorkflowState(
        prospect.phone,
        {
          campaignIntakeCodeId: match.campaignIntakeCodeId,
          campaignIntakeCampaignName: match.campaignName,
          campaignIntakePurpose: match.purpose,
          campaignIntakeMatchedAt: new Date().toISOString(),
          conversationGoal: IUL_CONVERSATION_GOAL,
          campaignKind: IUL_CAMPAIGN_KIND,
          iulWorkflowStage: IUL_STAGES.NEW_IUL_LEAD,
          workflowOwnership: OWNERSHIP.ATLAS
        },
        scope
      ).catch(() => null);
      await persistVerifiedAtlasEligibilitySource(
        prospect.phone,
        VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL,
        scope
      ).catch(() => null);
    }

    return {
      ok: true,
      recruitingEligible,
      iulReviewEligible: isIulReviewPurpose(match) && episode.allowed,
      eligibilityDecision,
      episode,
      attribution
    };
  }

  /**
   * Idempotent workflow/eligibility restore for stalled first-reply recovery.
   * Does not insert a new attribution row when one already exists.
   */
  async function reconcileStalledFirstReplyAttributionState({
    match,
    prospect,
    organizationId = null,
    providerMessageId = null,
    phoneNumberId = null,
    workflowState = null,
    attribution = null
  } = {}) {
    if (!match?.matched || !prospect?.phone) {
      return { ok: false, reason: "NO_MATCH" };
    }

    const recruitingEligible =
      attribution?.metadata?.recruitingEligible === true ||
      String(attribution?.eligibilityDecision || "").toUpperCase() ===
        "CAMPAIGN_INTAKE_CODE" ||
      (match.recruitingEligible === true && isRecruitingPurpose(match));

    if (!recruitingEligible) {
      return {
        ok: false,
        reason: attribution?.eligibilityDecision || "NOT_RECRUITING_ELIGIBLE"
      };
    }

    const scope = {
      organizationId: organizationId || prospect.organization_id || null,
      prospectId: prospect.id || null
    };

    await persistVerifiedAtlasEligibilitySource(
      prospect.phone,
      VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_CODE,
      scope
    ).catch(() => null);

    await savePersistedWorkflowState(
      prospect.phone,
      {
        campaignIntakeCodeId: match.campaignIntakeCodeId,
        campaignIntakeCampaignName: match.campaignName,
        campaignIntakePurpose: match.purpose,
        campaignIntakeMatchedAt:
          attribution?.matchedAt || workflowState?.campaignIntakeMatchedAt || new Date().toISOString(),
        canonicalMilestone: MILESTONES.NEW_LEAD,
        workflowOwnership: OWNERSHIP.ATLAS,
        manualAgentOwnership: false
      },
      scope
    ).catch(() => null);

    return {
      ok: true,
      recruitingEligible: true,
      eligibilityDecision: "CAMPAIGN_INTAKE_CODE",
      attribution,
      idempotent: true
    };
  }

  return {
    repository,
    lookupInboundMatch,
    resolveInboundCampaignIntakeMatch,
    establishInboundAttribution,
    reconcileStalledFirstReplyAttributionState,
    evaluateFreshIntakeEpisode,
    isRecruitingPurpose,
    mapMatchRecord
  };
}

let _defaultService = null;

function getCampaignIntakeAttributionService(options = {}) {
  if (options.repository || options.kind) {
    return createCampaignIntakeAttributionService(options);
  }
  if (!_defaultService) {
    _defaultService = createCampaignIntakeAttributionService();
  }
  return _defaultService;
}

function setCampaignIntakeAttributionServiceForTests(service) {
  _defaultService = service || null;
}

module.exports = {
  createCampaignIntakeAttributionService,
  getCampaignIntakeAttributionService,
  setCampaignIntakeAttributionServiceForTests,
  evaluateFreshIntakeEpisode,
  isRecruitingPurpose
};
