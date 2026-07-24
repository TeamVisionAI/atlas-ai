/**
 * Sprint 16.1 — Runtime registry for autonomous recruiting workflow dependencies.
 */

let registered = null;

function registerRecruitingWorkflow(deps) {
  registered = {
    prospectService: deps.prospectService,
    businessEventService: deps.businessEventService,
    prospectRepository: deps.prospectRepository
  };
}

function getRecruitingWorkflowDeps() {
  return registered;
}

function isRecruitingWorkflowReady() {
  return Boolean(
    registered?.prospectService &&
      registered?.businessEventService &&
      registered?.prospectRepository
  );
}

module.exports = {
  registerRecruitingWorkflow,
  getRecruitingWorkflowDeps,
  isRecruitingWorkflowReady
};
