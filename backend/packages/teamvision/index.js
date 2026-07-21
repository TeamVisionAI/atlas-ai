/**
 * Release 1.1 — Team Vision Recruiting Pack exports.
 */

const { PackageEvent } = require("./PackageEvents");
const {
  WORKFLOW_NAME,
  createDefaultConfiguration,
  resolveWorkflowName
} = require("./PackageConfiguration");
const { buildRecruitingWorkflow } = require("./RecruitingWorkflow");
const { evaluateQualification, updateQualificationRules } = require("./QualificationRules");
const { InterviewManager } = require("./InterviewManager");
const { applyPresentationOutcome, resolveOutcomes } = require("./PresentationOutcomes");
const { LicensingWorkflow, LicensingState } = require("./LicensingWorkflow");
const { OrientationWorkflow, OrientationState } = require("./OrientationWorkflow");
const { FastStartWorkflow, FastStartMilestone } = require("./FastStartWorkflow");
const { FollowUpEngine, DEFAULT_SEQUENCES } = require("./FollowUpEngine");
const { matchObjection, listObjections } = require("./ObjectionLibrary");
const { RecruitingAnalytics } = require("./RecruitingAnalytics");
const {
  RecruitingPackage,
  registerTeamVisionRecruitingPackage,
  getActiveRecruitingPackage,
  resetTeamVisionRecruitingPackage
} = require("./RecruitingPackage");

module.exports = {
  PackageEvent,
  WORKFLOW_NAME,
  createDefaultConfiguration,
  resolveWorkflowName,
  buildRecruitingWorkflow,
  evaluateQualification,
  updateQualificationRules,
  InterviewManager,
  applyPresentationOutcome,
  resolveOutcomes,
  LicensingWorkflow,
  LicensingState,
  OrientationWorkflow,
  OrientationState,
  FastStartWorkflow,
  FastStartMilestone,
  FollowUpEngine,
  DEFAULT_SEQUENCES,
  matchObjection,
  listObjections,
  RecruitingAnalytics,
  RecruitingPackage,
  registerTeamVisionRecruitingPackage,
  getActiveRecruitingPackage,
  resetTeamVisionRecruitingPackage
};
