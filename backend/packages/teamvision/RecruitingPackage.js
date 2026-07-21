/**
 * Release 1.1 — Team Vision Recruiting Pack orchestrator.
 * Registers package workflows and subscribes to package events.
 */

const { getWorkflowRegistry } = require("../../workflows/intelligence/WorkflowRegistry");
const { createDefaultConfiguration, resolveWorkflowName } = require("./PackageConfiguration");
const { buildRecruitingWorkflow } = require("./RecruitingWorkflow");
const { evaluateQualification } = require("./QualificationRules");
const { InterviewManager } = require("./InterviewManager");
const { applyPresentationOutcome } = require("./PresentationOutcomes");
const { LicensingWorkflow } = require("./LicensingWorkflow");
const { OrientationWorkflow } = require("./OrientationWorkflow");
const { FastStartWorkflow } = require("./FastStartWorkflow");
const { FollowUpEngine } = require("./FollowUpEngine");
const { matchObjection } = require("./ObjectionLibrary");
const { RecruitingAnalytics } = require("./RecruitingAnalytics");
const { PackageEvent } = require("./PackageEvents");

let activePackage = null;

class RecruitingPackage {
  /**
   * @param {Object} deps
   * @param {import('../../communication/events/EventBus').EventBus|null} [deps.eventBus]
   * @param {Object} [deps.configuration]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.configuration = createDefaultConfiguration(deps.configuration || {});
    this.interviewManager = new InterviewManager({
      eventBus: this.eventBus,
      configuration: this.configuration
    });
    this.licensing = new LicensingWorkflow({ eventBus: this.eventBus });
    this.orientation = new OrientationWorkflow({ eventBus: this.eventBus });
    this.fastStart = new FastStartWorkflow({ eventBus: this.eventBus });
    this.followUp = new FollowUpEngine({
      eventBus: this.eventBus,
      configuration: this.configuration
    });
    this.analytics = new RecruitingAnalytics();
    this._unsubscribers = [];
  }

  register() {
    const contract = buildRecruitingWorkflow(this.configuration);
    getWorkflowRegistry().register(contract);
    this.subscribe(this.eventBus);
    return {
      packageId: this.configuration.packageId,
      workflowName: contract.name
    };
  }

  subscribe(eventBus) {
    if (!eventBus) {
      return;
    }

    for (const eventName of Object.values(PackageEvent)) {
      this._unsubscribers.push(
        eventBus.on(eventName, (payload) => {
          this.analytics.track(eventName, payload);
        })
      );
    }
  }

  unregister() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  qualifyCandidate(facts) {
    const result = evaluateQualification(facts, this.configuration);
    this.eventBus?.emit(PackageEvent.CANDIDATE_QUALIFIED, result);
    return result;
  }

  handleObjection(text) {
    return matchObjection(text);
  }

  recordPresentationOutcome(outcomeId, candidateId) {
    const outcome = applyPresentationOutcome(outcomeId, this.configuration);
    this.eventBus?.emit(PackageEvent.PRESENTATION_COMPLETED, {
      candidateId,
      outcome: outcome.id
    });

    if (outcome.nextReminder) {
      this.followUp.startSequence(candidateId, outcome.nextReminder);
    }

    return outcome;
  }

  getWorkflowName() {
    return resolveWorkflowName(this.configuration);
  }
}

function registerTeamVisionRecruitingPackage(options = {}) {
  const recruitingPackage = new RecruitingPackage(options);
  const registration = recruitingPackage.register();
  activePackage = recruitingPackage;
  return { package: recruitingPackage, ...registration };
}

function getActiveRecruitingPackage() {
  return activePackage;
}

function resetTeamVisionRecruitingPackage() {
  if (activePackage) {
    activePackage.unregister();
  }

  activePackage = null;
}

module.exports = {
  RecruitingPackage,
  registerTeamVisionRecruitingPackage,
  getActiveRecruitingPackage,
  resetTeamVisionRecruitingPackage
};
