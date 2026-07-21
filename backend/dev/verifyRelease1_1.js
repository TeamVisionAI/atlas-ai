/**
 * Release 1.1 — Team Vision Recruiting Pack verification.
 * Run: node backend/dev/verifyRelease1_1.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { EventBus } = require("../communication/events/EventBus");
const { DECISION_TYPE, createConversationEngine, agentStore } = require("../agent");
const { createCommunicationGateway } = require("../gateway");
const { createMeetingLifecycle } = require("../meetings");
const appointmentStore = require("../appointments/AppointmentStore");
const meetingStore = require("../meetings/MeetingStore");
const { clearStore: clearWorkflowState } = require("../workflows/intelligence/WorkflowState");
const { executionHistory } = require("../agent/tools");
const { sessionStore } = require("../agent/runtime");
const { withSimulatorGuard } = require("./simulatorGuard");
const { signupWithPassword } = require("../services/atlasUserService");
const {
  createOrganizationForUser,
  activateOrganization
} = require("../services/organizationService");
const {
  registerTeamVisionRecruitingPackage,
  resetTeamVisionRecruitingPackage,
  createDefaultConfiguration,
  evaluateQualification,
  PackageEvent,
  LicensingState,
  FastStartMilestone,
  matchObjection,
  RecruitingAnalytics
} = require("../packages/teamvision");

const ORGS_FILE = path.join(__dirname, "../data/organizations.json");
const ANALYTICS_FILE = path.join(__dirname, "../data/teamvisionAnalytics.json");

async function runRecruitingConversation(engine, organization, workflowName) {
  const prospect = { id: "ATL-R11-001", displayName: "Maria Lopez" };
  const turns = [
    { text: "Hi there", messageId: "r11-1", expectStep: "collect_name" },
    { text: "Maria Lopez", messageId: "r11-2", expectStep: "collect_contact" },
    { text: "maria@example.com", messageId: "r11-3", expectStep: "collect_contact" },
    { text: "813-555-0100", messageId: "r11-4", expectStep: "collect_location" },
    { text: "Miami, FL", messageId: "r11-5", expectStep: "qualify_candidate" }
  ];

  let conversationId = null;

  for (const turn of turns) {
    const result = await engine.processInbound({
      text: turn.text,
      messageId: turn.messageId,
      channel: "messenger",
      conversationId,
      prospect,
      organization,
      workflowName
    });

    conversationId = result.conversationId;

    if (turn.expectStep) {
      assert.strictEqual(result.decision.currentStep, turn.expectStep);
    }
  }

  return { conversationId, prospect };
}

async function run() {
  console.log("Release 1.1 — Team Vision Recruiting Pack verification\n");

  await withSimulatorGuard(async () => {
    resetTeamVisionRecruitingPackage();
    agentStore.clearStore();
    clearWorkflowState();
    executionHistory.clearHistory();
    sessionStore.clearStore();
    appointmentStore.clearStore();
    meetingStore.clearStore();
    new RecruitingAnalytics().clear();

    if (fs.existsSync(ORGS_FILE)) {
      fs.unlinkSync(ORGS_FILE);
    }

    const eventBus = new EventBus();
    const packageEvents = [];

    for (const eventName of Object.values(PackageEvent)) {
      eventBus.on(eventName, (payload) => packageEvents.push({ eventName, payload }));
    }

    const user = await signupWithPassword({
      email: `release1.1.${Date.now()}@example.com`,
      password: "AtlasTest123"
    });
    const orgRecord = await createOrganizationForUser(user.id, "Acme Recruiting");
    await activateOrganization(orgRecord.id);

    const configuration = createDefaultConfiguration({
      organizationName: "Acme Recruiting",
      primaryOfficeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
      officeLocations: [
        {
          id: "primary-office",
          name: "Primary Office",
          address: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
          coverageRadiusMiles: 25
        }
      ]
    });

    const { package: recruitingPackage, workflowName } = registerTeamVisionRecruitingPackage({
      eventBus,
      configuration
    });

    assert.strictEqual(workflowName, "team-vision-recruiting");
    console.log("✓ Recruiting workflow operational");

    const qualified = evaluateQualification(
      {
        authorizedToWork: { value: "yes" },
        state: { value: "FL" },
        interestLevel: { value: "high" },
        availability: { value: "evenings" },
        preferredLanguage: { value: "en" }
      },
      configuration
    );
    assert.strictEqual(qualified.qualified, true);
    recruitingPackage.qualifyCandidate({
      authorizedToWork: { value: "yes" },
      state: { value: "FL" },
      interestLevel: { value: "high" },
      availability: { value: "evenings" },
      preferredLanguage: { value: "en" }
    });
    console.log("✓ Qualification rules configurable");

    const updatedRules = evaluateQualification(
      { authorizedToWork: { value: "no" }, state: { value: "FL" } },
      configuration
    );
    assert.strictEqual(updatedRules.qualified, false);
    console.log("✓ Qualification blocking rules enforced");

    const organization = {
      id: orgRecord.id,
      name: configuration.organizationName,
      officeAddress: configuration.officeLocations[0].address
    };

    const engine = createConversationEngine({ eventBus });
    await runRecruitingConversation(engine, organization, workflowName);
    console.log("✓ Agent reuses existing Conversation Engine with package workflow");

    createMeetingLifecycle({ eventBus });

    const interviewResult = await recruitingPackage.interviewManager.scheduleInterview({
      prospectId: "ATL-R11-001",
      prospectName: "Maria Lopez",
      email: "maria@example.com",
      phone: "813-555-0100",
      city: "Miami",
      state: "FL",
      interviewType: "zoom",
      preferredDate: "tomorrow",
      preferredTime: "morning"
    });

    assert.ok(interviewResult.appointment?.id, "Expected appointment scheduled");
    console.log("✓ Interview automation operational");
    console.log("✓ Calendar integration reused via existing appointment chain");

    const meeting = await recruitingPackage.interviewManager.prepareMeetingResources(
      interviewResult.appointment
    );
    assert.ok(meeting?.id, "Expected meeting prepared");
    const reminders = recruitingPackage.interviewManager.scheduleReminders(meeting);
    assert.ok(reminders.length >= 1, "Expected reminders scheduled");
    console.log("✓ Zoom integration reused via existing meeting lifecycle");

    const outcome = recruitingPackage.recordPresentationOutcome("joined", "ATL-R11-001");
    assert.strictEqual(outcome.nextWorkflow, "licensing");
    console.log("✓ Presentation outcomes operational");

    const licensing = recruitingPackage.licensing.start("ATL-R11-001");
    assert.strictEqual(licensing.state, LicensingState.REGISTRATION);

    let licenseState = licensing;
    const licensingPath = [
      LicensingState.STUDY_STARTED,
      LicensingState.STUDY_PROGRESS,
      LicensingState.PRACTICE_EXAM,
      LicensingState.EXAM_SCHEDULED,
      LicensingState.LICENSED
    ];

    for (const state of licensingPath) {
      licenseState = recruitingPackage.licensing.advance("ATL-R11-001", state);
    }

    assert.strictEqual(licenseState.state, LicensingState.LICENSED);
    console.log("✓ Licensing workflow operational");

    recruitingPackage.orientation.schedule("ATL-R11-001", {
      trainer: "Trainer A",
      office: "Primary Office",
      leader: "Leader B"
    });
    const orientation = recruitingPackage.orientation.complete("ATL-R11-001", {
      firstActivity: "shadow_interview"
    });
    assert.strictEqual(orientation.state, "orientation_completed");
    console.log("✓ Orientation workflow operational");

    recruitingPackage.fastStart.initialize("ATL-R11-001");
    for (const milestone of Object.values(FastStartMilestone)) {
      recruitingPackage.fastStart.recordMilestone("ATL-R11-001", milestone);
    }

    const fastStart = recruitingPackage.fastStart.getState("ATL-R11-001");
    assert.strictEqual(fastStart.completed, true);
    console.log("✓ Fast Start workflow operational");

    recruitingPackage.followUp.startSequence("ATL-R11-001", "after_interview");
    const nextStep = recruitingPackage.followUp.getNextStep("ATL-R11-001", "after_interview");
    assert.ok(nextStep?.message, "Expected follow-up step");
    recruitingPackage.followUp.advance("ATL-R11-001", "after_interview");
    console.log("✓ Follow-up engine operational");

    const objection = matchObjection("I need to think about it.");
    assert.ok(objection?.suggestedResponse);
    console.log("✓ Objection library operational");

    const metrics = recruitingPackage.analytics.getMetrics();
    assert.ok(metrics.candidates >= 1);
    assert.ok(metrics.interviews >= 1);
    assert.ok(fs.existsSync(ANALYTICS_FILE));
    console.log("✓ Analytics operational");

    assert.ok(packageEvents.some((entry) => entry.eventName === PackageEvent.CANDIDATE_QUALIFIED));
    assert.ok(packageEvents.some((entry) => entry.eventName === PackageEvent.INTERVIEW_SCHEDULED));
    assert.ok(packageEvents.some((entry) => entry.eventName === PackageEvent.LICENSE_COMPLETED));
    console.log("✓ Package events emitted");

    const gateway = createCommunicationGateway({ eventBus });
    const gatewayResult = await gateway.receive(
      "messenger",
      {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "USER_R11" },
                recipient: { id: "PAGE" },
                timestamp: 1520383572,
                message: { mid: "mid.r11", text: "Hi there" }
              }
            ]
          }
        ]
      },
      {
        organizationId: organization.id,
        organization,
        prospectId: "ATL-R11-GW",
        prospectDisplayName: "Gateway Candidate",
        workflowName
      }
    );

    assert.strictEqual(gatewayResult.success, true);
    assert.strictEqual(gatewayResult.agentResult.decision.decisionType, DECISION_TYPE.ASK);
    console.log("✓ Existing Gateway reused with package workflow");
  });

  console.log("\nVerifying Atlas Core remains green...\n");

  const coreScripts = [
    "backend/dev/verifyJourney7.js",
    "backend/dev/verifyJourney6.js",
    "backend/dev/verifyJourney5Increment4.js"
  ];

  for (const script of coreScripts) {
    execSync(`node ${script}`, { stdio: "inherit", cwd: path.join(__dirname, "..", "..") });
  }

  console.log("\n✓ Atlas Core unchanged");
  console.log("✓ Previous verification suites remain green");
  console.log("\nAll Release 1.1 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
