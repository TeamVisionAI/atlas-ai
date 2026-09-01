/**
 * BR-198 — authorized learning actions.
 * Approving a regression never authorizes implementation.
 * Implementation never mutates source, tests, or prompts.
 */

const crypto = require("node:crypto");
const {
  CASE_STATUSES,
  LEARNING_ACTIONS,
  PROPOSAL_STATUSES,
  REGRESSION_STATUSES,
  IMPLEMENTATION_STATUSES,
  AUDIT_ACTIONS,
  RISK_LEVELS
} = require("./constants");
const { allowsPreAuthorization } = require("./riskPolicy");
const { proposalRecord } = require("./learningProposal");
const {
  buildImplementationProposal,
  buildAuthorizedImplementationTask
} = require("./implementationProposal");
const { buildRegressionCandidate } = require("./regressionSpec");

const ACTION_AUDIT = Object.freeze({
  [LEARNING_ACTIONS.GENERATE_PROPOSAL]: AUDIT_ACTIONS.PROPOSAL_GENERATED,
  [LEARNING_ACTIONS.REJECT_PROPOSAL]: AUDIT_ACTIONS.PROPOSAL_REJECTED,
  [LEARNING_ACTIONS.REQUEST_REVISION]: AUDIT_ACTIONS.REVISION_REQUESTED,
  [LEARNING_ACTIONS.APPROVE_REGRESSION]: AUDIT_ACTIONS.REGRESSION_APPROVED,
  [LEARNING_ACTIONS.PROPOSE_IMPLEMENTATION]: AUDIT_ACTIONS.IMPLEMENTATION_PROPOSED,
  [LEARNING_ACTIONS.AUTHORIZE_IMPLEMENTATION]: AUDIT_ACTIONS.IMPLEMENTATION_AUTHORIZED,
  [LEARNING_ACTIONS.REJECT_IMPLEMENTATION]: AUDIT_ACTIONS.IMPLEMENTATION_REJECTED,
  [LEARNING_ACTIONS.MARK_IMPLEMENTED]: AUDIT_ACTIONS.IMPLEMENTATION_IMPLEMENTED,
  [LEARNING_ACTIONS.MARK_VERIFIED]: AUDIT_ACTIONS.LEARNING_VERIFIED,
  [LEARNING_ACTIONS.REOPEN]: AUDIT_ACTIONS.LEARNING_REOPENED
});

function fail(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.publicCode = code;
  throw error;
}

function assertNoBypass(payload = {}) {
  if (payload.preAuthorize === true || payload.skipAuthorization === true || payload.autoAuthorize === true) {
    fail("IMPLEMENTATION_AUTHORIZATION_REQUIRED");
  }
}

async function recordLearningAudit(store, entry) {
  const row = {
    id: `lact-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...entry
  };
  if (typeof store.insertLearningAction === "function") {
    await store.insertLearningAction(row);
  } else if (typeof store.recordAudit === "function") {
    store.recordAudit(row);
  }
  return row;
}

async function applyLearningAction({
  qualityCase,
  action,
  actorUserId,
  notes = null,
  expectedBehavior = {},
  linkedPr = null,
  linkedBr = null,
  store,
  sourceBr = "BR-198",
  preAuthorize = false,
  skipAuthorization = false,
  autoAuthorize = false
} = {}) {
  if (!qualityCase) {
    fail("QUALITY_CASE_NOT_FOUND", 404);
  }
  if (!ACTION_AUDIT[action]) {
    fail("UNSUPPORTED_LEARNING_ACTION");
  }
  assertNoBypass({ preAuthorize, skipAuthorization, autoAuthorize });

  const proposal = store.getProposalByCase
    ? await store.getProposalByCase(qualityCase.id)
    : null;
  const regression = qualityCase.regressionCandidateId
    ? await store.getRegression(qualityCase.regressionCandidateId)
    : store.getRegressionByCase
      ? await store.getRegressionByCase(qualityCase.id)
      : null;
  const implementation = store.getImplementationByCase
    ? await store.getImplementationByCase(qualityCase.id)
    : null;

  let nextProposal = proposal;
  let nextRegression = regression;
  let nextImplementation = implementation;
  let nextCase = qualityCase;
  const mutatedFiles = [];

  if (action === LEARNING_ACTIONS.GENERATE_PROPOSAL) {
    nextProposal = await store.upsertProposal(
      proposalRecord({
        qualityCase: {
          ...qualityCase,
          expectedBehavior: expectedBehavior && Object.keys(expectedBehavior).length
            ? expectedBehavior
            : qualityCase.expectedBehavior
        },
        actorUserId,
        overrides: notes ? { problem_summary: notes } : {}
      })
    );
    nextCase = await store.updateCase(qualityCase.id, {
      status: qualityCase.status === CASE_STATUSES.NEW ? CASE_STATUSES.REVIEWING : qualityCase.status,
      reviewerUserId: actorUserId,
      reviewNotes: notes || qualityCase.reviewNotes || null,
      learningProposalId: nextProposal.id
    });
  } else if (action === LEARNING_ACTIONS.REJECT_PROPOSAL) {
    if (!proposal) {
      fail("PROPOSAL_REQUIRED");
    }
    nextProposal = await store.updateProposal(proposal.id, { status: PROPOSAL_STATUSES.REJECTED });
  } else if (action === LEARNING_ACTIONS.REQUEST_REVISION) {
    if (!proposal) {
      fail("PROPOSAL_REQUIRED");
    }
    nextProposal = await store.updateProposal(proposal.id, {
      status: PROPOSAL_STATUSES.REVISION_REQUESTED
    });
  } else if (action === LEARNING_ACTIONS.APPROVE_REGRESSION) {
    if (!proposal || proposal.status !== PROPOSAL_STATUSES.GENERATED) {
      fail("REGRESSION_APPROVAL_REQUIRED");
    }
    const specBundle = buildRegressionCandidate({
      qualityCase: {
        ...qualityCase,
        expectedBehavior: expectedBehavior || qualityCase.expectedBehavior
      },
      expectedBehavior: {
        ...(qualityCase.expectedBehavior || {}),
        ...expectedBehavior,
        title: expectedBehavior.title || proposal.proposal?.problem_summary,
        forbiddenBehavior:
          expectedBehavior.forbiddenBehavior || proposal.proposal?.forbidden_behavior || [],
        expectedIntent: expectedBehavior.expectedIntent || qualityCase.semanticInterpretation?.intent || null,
        expectedNextAction:
          expectedBehavior.expectedNextAction || proposal.proposal?.recommended_action || null,
        expectedReplyBehavior: expectedBehavior.expectedReplyBehavior || proposal.proposal?.expected_behavior
      },
      sourceBr
    });
    specBundle.spec.status = REGRESSION_STATUSES.APPROVED;
    specBundle.spec.riskLevel = proposal.riskLevel;
    specBundle.spec.reviewerUserId = actorUserId;
    specBundle.spec.createdAt = new Date().toISOString();
    specBundle.spec.implementationAuthorized = false;
    specBundle.spec.mutatesSourceCode = false;
    specBundle.spec.mutatesTests = false;
    const existing = regression || (await store.getRegression(`reg-${qualityCase.id}`));
    if (existing) {
      nextRegression = await store.updateRegression(existing.id, {
        status: REGRESSION_STATUSES.APPROVED,
        spec: specBundle.spec,
        markdown: specBundle.markdown,
        reviewerUserId: actorUserId,
        riskLevel: proposal.riskLevel,
        approvedAt: specBundle.spec.createdAt
      });
    } else {
      nextRegression = await store.insertRegression({
        id: `reg-${qualityCase.id}`,
        organizationId: qualityCase.organizationId,
        caseId: qualityCase.id,
        status: REGRESSION_STATUSES.APPROVED,
        spec: specBundle.spec,
        markdown: specBundle.markdown,
        createdByUserId: actorUserId,
        reviewerUserId: actorUserId,
        riskLevel: proposal.riskLevel,
        approvedAt: specBundle.spec.createdAt,
        createdAt: specBundle.spec.createdAt,
        mutatesSourceCode: false,
        mutatesTests: false,
        implementationAuthorized: false
      });
    }
    nextProposal = await store.updateProposal(proposal.id, {
      status: PROPOSAL_STATUSES.REGRESSION_APPROVED
    });
    nextImplementation = await store.upsertImplementation(
      buildImplementationProposal({
        qualityCase,
        learningProposal: nextProposal.status ? { ...proposal, ...nextProposal } : proposal,
        regression: nextRegression
      })
    );
    nextCase = await store.updateCase(qualityCase.id, {
      status: CASE_STATUSES.REGRESSION_CANDIDATE,
      reviewerUserId: actorUserId,
      reviewNotes: notes || qualityCase.reviewNotes || null,
      expectedBehavior:
        expectedBehavior && Object.keys(expectedBehavior).length
          ? expectedBehavior
          : qualityCase.expectedBehavior,
      regressionCandidateId: nextRegression.id,
      implementationId: nextImplementation.id
    });
  } else if (action === LEARNING_ACTIONS.PROPOSE_IMPLEMENTATION) {
    if (!regression || regression.status !== REGRESSION_STATUSES.APPROVED) {
      fail("REGRESSION_APPROVAL_REQUIRED");
    }
    if (!proposal) {
      fail("PROPOSAL_REQUIRED");
    }
    nextImplementation = await store.upsertImplementation(
      buildImplementationProposal({ qualityCase, learningProposal: proposal, regression })
    );
  } else if (action === LEARNING_ACTIONS.AUTHORIZE_IMPLEMENTATION) {
    if (!regression || regression.status !== REGRESSION_STATUSES.APPROVED) {
      fail("REGRESSION_APPROVAL_REQUIRED");
    }
    if (!implementation) {
      fail("IMPLEMENTATION_PROPOSAL_REQUIRED");
    }
    if (implementation.status === IMPLEMENTATION_STATUSES.AUTHORIZED) {
      nextImplementation = implementation;
    } else {
      if (allowsPreAuthorization(proposal?.riskLevel || RISK_LEVELS.HIGH)) {
        fail("IMPLEMENTATION_AUTHORIZATION_REQUIRED");
      }
      const authorized = buildAuthorizedImplementationTask(implementation, { actorUserId });
      nextImplementation = await store.updateImplementation(implementation.id, {
        status: IMPLEMENTATION_STATUSES.AUTHORIZED,
        spec: authorized.spec,
        markdown: authorized.markdown,
        authorizedByUserId: actorUserId,
        authorizedAt: authorized.authorizedAt,
        linkedBr: linkedBr || implementation.linkedBr || sourceBr,
        linkedPr: linkedPr || implementation.linkedPr || null,
        mutatesSourceCode: false,
        mutatesTests: false
      });
    }
  } else if (action === LEARNING_ACTIONS.REJECT_IMPLEMENTATION) {
    if (!implementation) {
      fail("IMPLEMENTATION_PROPOSAL_REQUIRED");
    }
    nextImplementation = await store.updateImplementation(implementation.id, {
      status: IMPLEMENTATION_STATUSES.REJECTED
    });
  } else if (action === LEARNING_ACTIONS.MARK_IMPLEMENTED) {
    if (!implementation || implementation.status !== IMPLEMENTATION_STATUSES.AUTHORIZED) {
      fail("IMPLEMENTATION_AUTHORIZATION_REQUIRED");
    }
    nextImplementation = await store.updateImplementation(implementation.id, {
      status: IMPLEMENTATION_STATUSES.IMPLEMENTED,
      linkedPr: linkedPr || implementation.linkedPr || null,
      linkedBr: linkedBr || implementation.linkedBr || sourceBr,
      mutatesSourceCode: false,
      mutatesTests: false
    });
    if (regression) {
      nextRegression = await store.updateRegression(regression.id, {
        status: REGRESSION_STATUSES.IMPLEMENTED
      });
    }
  } else if (action === LEARNING_ACTIONS.MARK_VERIFIED) {
    if (
      !implementation ||
      ![IMPLEMENTATION_STATUSES.IMPLEMENTED, IMPLEMENTATION_STATUSES.AUTHORIZED].includes(
        implementation.status
      )
    ) {
      fail("IMPLEMENTATION_AUTHORIZATION_REQUIRED");
    }
    nextImplementation = await store.updateImplementation(implementation.id, {
      status: IMPLEMENTATION_STATUSES.VERIFIED
    });
    if (regression) {
      nextRegression = await store.updateRegression(regression.id, {
        status: REGRESSION_STATUSES.VERIFIED
      });
    }
    nextCase = await store.updateCase(qualityCase.id, {
      status: CASE_STATUSES.RESOLVED,
      reviewerUserId: actorUserId
    });
  } else if (action === LEARNING_ACTIONS.REOPEN) {
    if (proposal) {
      nextProposal = await store.updateProposal(proposal.id, { status: PROPOSAL_STATUSES.GENERATED });
    }
    nextCase = await store.updateCase(qualityCase.id, {
      status: CASE_STATUSES.REVIEWING,
      reviewerUserId: actorUserId,
      reviewNotes: notes || qualityCase.reviewNotes || null
    });
  }

  const auditEntry = {
    action: ACTION_AUDIT[action],
    organizationId: qualityCase.organizationId,
    userId: actorUserId,
    targetType: "ai_quality_case",
    targetId: qualityCase.id,
    result: "success",
    metadata: {
      learningAction: action,
      proposalId: nextProposal?.id || null,
      regressionId: nextRegression?.id || null,
      implementationId: nextImplementation?.id || null,
      riskLevel: nextProposal?.riskLevel || proposal?.riskLevel || null,
      implementationAuthorized: nextImplementation?.status === IMPLEMENTATION_STATUSES.AUTHORIZED,
      mutatesSourceCode: false,
      mutatesTests: false,
      mutatedFiles,
      autoMerge: false
    }
  };
  if (typeof store.recordAudit === "function") {
    store.recordAudit(auditEntry);
  }
  const learningAction = await recordLearningAudit(store, {
    organizationId: qualityCase.organizationId,
    caseId: qualityCase.id,
    proposalId: nextProposal?.id || null,
    regressionId: nextRegression?.id || null,
    implementationId: nextImplementation?.id || null,
    action,
    actorUserId,
    result: "success",
    metadata: auditEntry.metadata
  });

  return {
    qualityCase: nextCase,
    proposal: nextProposal,
    regression: nextRegression,
    implementation: nextImplementation,
    auditEntry,
    learningAction,
    implementationAuthorized: nextImplementation?.status === IMPLEMENTATION_STATUSES.AUTHORIZED,
    mutatesSourceCode: false,
    mutatesTests: false,
    mutatedFiles
  };
}

module.exports = {
  ACTION_AUDIT,
  applyLearningAction
};
