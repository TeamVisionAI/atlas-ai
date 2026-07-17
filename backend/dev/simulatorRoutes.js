console.log("✅ simulatorRoutes.js LOADED");
const express = require("express");
const path = require("path");

const { handleIncomingMessage, buildHandoff, extractEmail } = require("../core/conversationEngine");
const { parseSchedulingState } = require("../core/schedulingState");
const { releaseSlotByIso } = require("../core/capacityEngine");
const { detectIntent } = require("../core/intentEngine");
const { routeConversation } = require("../core/conversationRouter");
const { findFAQ } = require("../core/faqEngine");
const { buildMemory } = require("../core/memoryEngine");
const {
  validateAnswer
} = require("../core/validationEngine");
const businessRules = require("../core/businessRules");

const {
  findProspect,
  deleteProspect
} = require("../services/supabaseService");
const { getConversationTimeline } = require("../services/timelineService");

const router = express.Router();

const DEV_PHONE = "developer-test-user";
const DEV_NAME = "Developer Test User";

const PIPELINE_STAGES = [
  "GREETING",
  "CITY",
  "WORK_AUTHORIZATION",
  "OCCUPATION",
  "INTERVIEW_TYPE",
  "INTERVIEW_TIME",
  "EMAIL",
  "CONFIRMED"
];

const ENGINE_STEP_TO_PIPELINE = {
  NEW: "GREETING",
  GREETING: "CITY",
  WORK_AUTHORIZATION: "WORK_AUTHORIZATION",
  OCCUPATION: "OCCUPATION",
  INTERVIEW_TYPE: "INTERVIEW_TYPE",
  SCHEDULE: "INTERVIEW_TIME",
  EMAIL: "EMAIL",
  CONFIRMED: "CONFIRMED"
};

const BUSINESS_RULE_LABELS = {
  AUTO_DETECT_LANGUAGE: "Auto Detect Language",
  ALWAYS_ANSWER_INTERRUPTIONS: "Answer Interruptions",
  NEVER_ASK_LANGUAGE: "Never Ask Language",
  REQUIRE_WORK_AUTHORIZATION: "Require Work Authorization",
  COLLECT_CITY_BEFORE_SCHEDULING: "Collect City",
  COLLECT_OCCUPATION: "Validate Occupation",
  NEVER_DISCUSS_REGISTRATION_COST_BEFORE_PRESENTATION: "Defer Registration Cost",
  NEVER_PROMISE_INCOME: "Never Promise Income",
  NEVER_GUARANTEE_LICENSE: "Never Guarantee License",
  ALWAYS_CREATE_CALENDAR_EVENT: "Schedule Interview",
  ALWAYS_CONFIRM_APPOINTMENT: "Confirm Appointment",
  ALLOW_HUMAN_TAKEOVER: "Allow Human Takeover",
  LOG_ALL_CONVERSATIONS: "Log All Conversations",
  LEARN_FROM_REAL_CONVERSATIONS: "Learn From Conversations"
};

function buildPipelineProgress(currentStep) {
  const pipelineStep =
    ENGINE_STEP_TO_PIPELINE[currentStep] || "GREETING";
  const currentIndex = PIPELINE_STAGES.indexOf(pipelineStep);

  return PIPELINE_STAGES.map((stage, index) => ({
    stage,
    status:
      index < currentIndex
        ? "completed"
        : index === currentIndex
          ? "current"
          : "upcoming"
  }));
}

function buildConversationMetrics(timeline, responseTimeMs, debug) {
  const messagesSent = timeline.filter(
    (entry) => entry.direction === "incoming"
  ).length;
  const messagesReceived = timeline.filter(
    (entry) => entry.direction === "outgoing"
  ).length;

  let conversationDurationMs = 0;

  if (timeline.length >= 2) {
    const first = new Date(timeline[0].created_at).getTime();
    const last = new Date(timeline[timeline.length - 1].created_at).getTime();
    conversationDurationMs = Math.max(last - first, 0);
  }

  return {
    messagesSent,
    messagesReceived,
    conversationDurationMs,
    currentResponseTimeMs: responseTimeMs,
    currentLanguage: debug.collectedData?.language || "unknown",
    currentIntent: debug.currentIntent,
    currentStep: debug.currentStage
  };
}

function buildBusinessRulesPanel(intent, step) {
  const contextualRules = [];

  if (step === "GREETING" || step === "NEW") {
    contextualRules.push("COLLECT_CITY_BEFORE_SCHEDULING");
  }

  if (step === "WORK_AUTHORIZATION") {
    contextualRules.push("REQUIRE_WORK_AUTHORIZATION");
  }

  if (step === "OCCUPATION") {
    contextualRules.push("COLLECT_OCCUPATION");
  }

  if (step === "EMAIL" || step === "CONFIRMED") {
    contextualRules.push("ALWAYS_CREATE_CALENDAR_EVENT");
  }

  if (step === "CONFIRMED") {
    contextualRules.push("ALWAYS_CONFIRM_APPOINTMENT");
  }

  if (intent === "COST") {
    contextualRules.push("NEVER_DISCUSS_REGISTRATION_COST_BEFORE_PRESENTATION");
  }

  if (intent === "SALARY") {
    contextualRules.push("NEVER_PROMISE_INCOME");
  }

  if (intent === "LICENSE") {
    contextualRules.push("NEVER_GUARANTEE_LICENSE");
  }

  const activeRuleKeys = [
    ...new Set([
      "AUTO_DETECT_LANGUAGE",
      "ALWAYS_ANSWER_INTERRUPTIONS",
      "LOG_ALL_CONVERSATIONS",
      ...contextualRules
    ])
  ];

  return activeRuleKeys.map((key) => ({
    key,
    label: BUSINESS_RULE_LABELS[key] || key,
    active: Boolean(businessRules[key])
  }));
}

function buildMemoryTimeline(prospect) {
  if (!prospect) {
    return [];
  }

  const timeline = [{ label: "Greeting", value: "Complete" }];

  if (prospect.city) {
    timeline.push({ label: "City", value: prospect.city });
  }

  if (prospect.state) {
    timeline.push({ label: "State", value: prospect.state });
  }

  if (prospect.work_authorized !== null && prospect.work_authorized !== undefined) {
    timeline.push({
      label: "Authorized",
      value: prospect.work_authorized ? "Yes" : "No"
    });
  }

  if (prospect.occupation) {
    timeline.push({ label: "Occupation", value: prospect.occupation });
  }

  if (prospect.interview_type) {
    timeline.push({ label: "Interview Type", value: prospect.interview_type });
  }

  if (prospect.interview_time) {
    timeline.push({ label: "Interview Time", value: prospect.interview_time });
  }

  const email = extractEmail(prospect.notes);
  if (email) {
    timeline.push({ label: "Email", value: email });
  }

  if (prospect.current_step === "CONFIRMED") {
    timeline.push({ label: "Confirmed", value: "Yes" });
  }

  return timeline;
}

function mapBusinessRule(intent, step) {
  const ruleMap = {
    COST: "NEVER_DISCUSS_REGISTRATION_COST_BEFORE_PRESENTATION",
    SALARY: "NEVER_PROMISE_INCOME",
    LICENSE: "NEVER_GUARANTEE_LICENSE",
    PRIMERICA: "ALWAYS_ANSWER_INTERRUPTIONS",
    REMOTE: "ALWAYS_ANSWER_INTERRUPTIONS"
  };

  if (ruleMap[intent]) {
    return ruleMap[intent];
  }

  if (step === "EMAIL" || step === "CONFIRMED") {
    return "ALWAYS_CREATE_CALENDAR_EVENT";
  }

  if (step === "CONFIRMED") {
    return "ALWAYS_CONFIRM_APPOINTMENT";
  }

  if (step === "WORK_AUTHORIZATION") {
    return "REQUIRE_WORK_AUTHORIZATION";
  }

  if (step === "GREETING") {
    return "COLLECT_CITY_BEFORE_SCHEDULING";
  }

  if (step === "OCCUPATION") {
    return "COLLECT_OCCUPATION";
  }

  return null;
}

function mapLeadStatus(step) {
  if (!step) {
    return "New";
  }

  if (step === "CONFIRMED") {
    return "Confirmed";
  }

  return "Active";
}

async function buildDebugSnapshot(prospect, lastMessage, responseTimeMs) {
  const intent = detectIntent(lastMessage);
  const memory = prospect ? buildMemory(prospect) : null;
  const language = memory?.language === "es" ? "es" : "en";
  const currentStep = prospect?.current_step || "NEW";
  const validation = prospect
    ? validateAnswer(prospect.current_step, lastMessage, {
        interviewType: prospect.interview_type,
        schedulingState: parseSchedulingState(prospect.notes),
        occupation: prospect.occupation
      })
    : { valid: true };
  const faqReply = findFAQ(lastMessage, language);
  const route = prospect
    ? routeConversation({
        prospect,
        message: lastMessage,
        intent
      })
    : { interrupt: false };

  const timeline = await getConversationTimeline(DEV_PHONE);
  const primericaMention = timeline.some(
    (entry) => entry.intent === "PRIMERICA"
  );

  const handoff = buildHandoff(prospect);
  const email = extractEmail(prospect?.notes);

  const debug = {
    currentStage: currentStep,
    currentIntent: intent,
    leadStatus: mapLeadStatus(currentStep),
    memory,
    collectedData: {
      city: prospect?.city || null,
      state: prospect?.state || null,
      occupation: prospect?.occupation || null,
      authorization: prospect?.work_authorized ?? null,
      interviewType: prospect?.interview_type || null,
      interviewTime: prospect?.interview_time || null,
      email,
      language: memory?.language || "unknown"
    },
    handoff,
    readiness: {
      conversationCompleted: currentStep === "CONFIRMED" ? "YES" : "NO",
      readyForHandoff: handoff?.handoffReady ? "YES" : "NO",
      calendarReady: prospect?.calendar_event_id ? "YES" : "NO"
    },
    previousPrimerica: primericaMention,
    responseTimeMs,
    validationResult: validation,
    faqTriggered: Boolean(faqReply),
    businessRuleApplied: mapBusinessRule(intent, currentStep),
    conversationId: prospect?.id || DEV_PHONE,
    routeInterrupt: route.interrupt,
    activeBusinessRules: businessRules
  };

  debug.pipelineProgress = buildPipelineProgress(currentStep);
  debug.metrics = buildConversationMetrics(timeline, responseTimeMs, debug);
  debug.businessRulesPanel = buildBusinessRulesPanel(intent, currentStep);
  debug.memoryTimeline = buildMemoryTimeline(prospect);

  return debug;
}

function formatHistory(timeline) {
  return timeline.map((entry) => ({
    role: entry.direction === "incoming" ? "USER" : "ATLAS",
    message: entry.message,
    timestamp: entry.created_at
  }));
}

router.get("/simulator", (req, res) => {
  res.sendFile(path.join(__dirname, "simulator.html"));
});

router.get("/simulator/state", async (req, res) => {
  try {
    const prospect = await findProspect(DEV_PHONE);
    const memory = prospect ? buildMemory(prospect) : null;
    const timeline = await getConversationTimeline(DEV_PHONE);
    const currentStep = prospect?.current_step || "NEW";
    const handoff = buildHandoff(prospect);
    const email = extractEmail(prospect?.notes);
    const debug = {
      currentStage: currentStep,
      currentIntent: "—",
      collectedData: {
        city: prospect?.city || null,
        state: prospect?.state || null,
        occupation: prospect?.occupation || null,
        authorization: prospect?.work_authorized ?? null,
        interviewType: prospect?.interview_type || null,
        interviewTime: prospect?.interview_time || null,
        email,
        language: memory?.language || "unknown"
      },
      handoff,
      readiness: {
        conversationCompleted: currentStep === "CONFIRMED" ? "YES" : "NO",
        readyForHandoff: handoff?.handoffReady ? "YES" : "NO",
        calendarReady: prospect?.calendar_event_id ? "YES" : "NO"
      },
      responseTimeMs: 0
    };

    debug.pipelineProgress = buildPipelineProgress(currentStep);
    debug.metrics = buildConversationMetrics(timeline, 0, debug);
    debug.businessRulesPanel = buildBusinessRulesPanel("UNKNOWN", currentStep);
    debug.memoryTimeline = buildMemoryTimeline(prospect);

    res.json({
      success: true,
      phone: DEV_PHONE,
      prospect,
      memory,
      history: formatHistory(timeline),
      debug
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get("/simulator/memory", async (req, res) => {
  try {
    const prospect = await findProspect(DEV_PHONE);
    const memory = prospect ? buildMemory(prospect) : null;

    res.json({
      success: true,
      phone: DEV_PHONE,
      prospect,
      memory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post("/simulator/message", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    const startedAt = Date.now();
    const result = await handleIncomingMessage(DEV_PHONE, DEV_NAME, message);
    const responseTimeMs = Date.now() - startedAt;
    const reply =
      typeof result === "string" ? result : result?.reply || "";
    const handoff =
      typeof result === "object" && result !== null ? result.handoff : null;

    const prospect = await findProspect(DEV_PHONE);
    const debug = await buildDebugSnapshot(prospect, message, responseTimeMs);
    if (handoff) {
      debug.handoff = handoff;
      debug.readiness = {
        conversationCompleted: "YES",
        readyForHandoff: handoff.handoffReady ? "YES" : "NO",
        calendarReady: prospect?.calendar_event_id ? "YES" : "NO"
      };
    }
    const timeline = await getConversationTimeline(DEV_PHONE);

    res.json({
      success: true,
      reply,
      handoff: handoff || debug.handoff || null,
      debug,
      history: formatHistory(timeline)
    });
  } catch (error) {
    console.error("Simulator error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post("/simulator/reset", async (req, res) => {
  try {
    const prospect = await findProspect(DEV_PHONE);

    if (prospect?.appointment_date && prospect?.interview_type) {
      releaseSlotByIso(prospect.appointment_date, prospect.interview_type);
    }

    await deleteProspect(DEV_PHONE);

    res.json({
      success: true,
      message: "Developer test conversation reset"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
