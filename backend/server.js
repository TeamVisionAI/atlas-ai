require("dotenv").config();

const { assertProductionPlatformConfig } = require("./core/platformProductionGuard");
assertProductionPlatformConfig();

const express = require("express");
const cors = require("cors");
const { buildCorsOptions } = require("./config/corsOptions");

const healthRoute = require("./routes/health");
const infoRoute = require("./routes/info");
const recruitRoute = require("./routes/recruit");
const webhookRoute = require("./routes/webhook");
const messengerWebhookRoute = require("./routes/messengerWebhook");

const simulatorRoutes = require("./dev/simulatorRoutes");
const createOperationsRoutes = require("./dev/operationsRoutes");

const dashboardRoutes = require("./routes/dashboard");
const timelineRoutes = require("./routes/timeline");
const missionControlRoutes = require("./routes/missionControl");
const executiveDashboardRoutes = require("./routes/executiveDashboard");
const organizationRoutes = require("./routes/organization");
const quickCaptureRoutes = require("./routes/quickCapture");
const authRoutes = require("./routes/auth");
const adminUsersRoutes = require("./routes/adminUsers");
const securitiesAccessRoutes = require("./routes/securitiesAccess");
const metaReviewUsersRoutes = require("./routes/metaReviewUsers");
const setupRoutes = require("./routes/setup");
const accountRoutes = require("./routes/account");
const configurationRoutes = require("./routes/configuration");
const appointmentRoutes = require("./routes/appointments");
const interviewAssignmentRoutes = require("./routes/interviewAssignment");
const missionRoutes = require("./routes/missions");
const prospectWorkspaceRoutes = require("./routes/prospectWorkspace");
const {
  prospectCommunicationsStack
} = require("./routes/communicationsCenter");
const prospectCenterRoutes = require("./routes/prospectCenter");
const followUpsRoutes = require("./routes/followUps");
const metaOnboardingRoutes = require("./routes/metaOnboarding");
const knowledgeRoutes = require("./routes/knowledge");
const platformStatusRoutes = require("./routes/platformStatus");
const recruitingWorkflowRoutes = require("./routes/recruitingWorkflow");
const facebookLeadWebhookRoute = require("./routes/facebookLeadWebhook");
const { createBusinessEventModule } = require("./modules/business-events");
const { createProjectionModule } = require("./modules/projections");
const { createProspectModule } = require("./modules/prospects");
const { createTimelineModule } = require("./modules/timeline");
const { createMissionControlModule } = require("./modules/mission-control");
const { createExecutiveDashboardModule } = require("./modules/executive-dashboard");
const { createPolicyIntelligenceModule } = require("./modules/policy-intelligence");
const { createFinancialIntelligenceModule } = require("./modules/financial-intelligence");
const { createWorkflowModule } = require("./modules/workflows");
const { requireAtlasUser } = require("./middleware/requireAtlasUser");
const { verifyMetaWebhookSignature } = require("./middleware/metaWebhookSignature");
const { safeRequestLogger } = require("./middleware/safeRequestLogger");
const contactRoutes = require("./routes/contact");
const qrGoRoutes = require("./routes/qrGo");

const {
  logMetaEnvironmentWarnings
} = require("./core/meta/metaEnvironmentValidator");
const { isMetaReviewModeEnabled } = require("./config/metaReviewMode");
const { ensureMetaReviewDemoData } = require("./dev/environment/seedMetaReviewDemo");
const { assertProductionReadinessAsync } = require("./core/productionReadinessValidator");
const { registerRecruitingWorkflow } = require("./core/recruitingWorkflowRegistry");

const businessEventModule = createBusinessEventModule({
  registerTimelineSubscriber: false
});

const workflowModule = createWorkflowModule({
  publisher: businessEventModule.publisher
});

const projectionModule = createProjectionModule({
  publisher: businessEventModule.publisher,
  businessEventRepository: businessEventModule.repository
});

const timelineModule = createTimelineModule({
  projectionEngine: projectionModule.engine,
  businessEventRepository: businessEventModule.repository
});

const missionControlModule = createMissionControlModule({
  projectionEngine: projectionModule.engine,
  businessEventRepository: businessEventModule.repository
});

const executiveDashboardModule = createExecutiveDashboardModule({
  projectionEngine: projectionModule.engine,
  businessEventRepository: businessEventModule.repository
});

const policyIntelligenceModule = createPolicyIntelligenceModule();
const financialIntelligenceModule = createFinancialIntelligenceModule();

const prospectModule = createProspectModule({
  businessEventEngine: businessEventModule.prospectAdapter,
  prospectEventsHandler: businessEventModule.prospectEventsHandler
});

const app = express();
const PORT = process.env.PORT || 3000;

// General middleware — production allowlist includes teamvisionfinancial.com (+ www, localhost dev)
app.use(cors(buildCorsOptions()));
app.use(safeRequestLogger);

// Meta webhook must receive the raw body before express.json().
app.use(
  "/webhook",
  express.raw({ type: "application/json" }),
  webhookRoute
);

app.use(
  "/webhook/messenger",
  express.raw({ type: "application/json" }),
  messengerWebhookRoute
);

app.use(
  "/webhook/facebook-leads",
  express.raw({ type: "application/json" }),
  verifyMetaWebhookSignature,
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(req.body.toString("utf8"));
      } catch {
        req.body = {};
      }
    }

    next();
  },
  facebookLeadWebhookRoute
);

// JSON parsing for all non-webhook routes.
app.use(express.json());

// Basic routes
app.get("/", (req, res) => {
  res.json({
    app: "Atlas AI",
    version: "0.4.0",
    status: "running",
    message: "🚀 Atlas AI Backend Running",
  });
});

app.get("/atlas-test", (req, res) => {
  res.send("Atlas Test Route Works");
});

app.use("/health", healthRoute);
app.use("/api/info", infoRoute);
app.use("/api/recruit", recruitRoute);
app.use("/api/contact", contactRoutes);
app.use("/go", qrGoRoutes);
app.use("/api/recruiting", recruitingWorkflowRoutes);

// Atlas application routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/mission-control", missionControlModule.routes);
app.use("/api/mission-control", missionControlRoutes);
app.use("/api/executive-dashboard", executiveDashboardModule.routes);
app.use("/api/executive-dashboard", executiveDashboardRoutes);
app.use("/api/policy-intelligence", policyIntelligenceModule.routes);
app.use("/api/financial-intelligence", financialIntelligenceModule.routes);
app.use("/api/prospect-workspace", prospectWorkspaceRoutes);
app.use("/api/prospect-center", prospectCenterRoutes);
app.use("/api/new-lead-attention", require("./routes/newLeadAttention"));
app.use("/api/follow-ups", followUpsRoutes);
app.use("/api/meta", metaOnboardingRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/platform-status", platformStatusRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/business-events", businessEventModule.routes);
app.use(
  "/api/operations",
  createOperationsRoutes({ businessEventService: businessEventModule.service })
);
app.use("/api/timeline", timelineModule.routes);
app.get(
  "/api/prospects/:id/timeline",
  requireAtlasUser,
  timelineModule.prospectTimelineHandler
);
app.get("/api/prospects/:id/communications", ...prospectCommunicationsStack);
app.use("/api/prospects", prospectModule.routes);
app.use("/api", setupRoutes);
app.use("/api", authRoutes);
app.use("/api/admin", adminUsersRoutes);
app.use("/api/securities-access", securitiesAccessRoutes);
app.use("/api/admin/securities-access", securitiesAccessRoutes);
app.use("/api/admin/review-users", metaReviewUsersRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/configuration", configurationRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/interview-assignment", interviewAssignmentRoutes);
app.use("/api/missions", missionRoutes);
app.use("/api", quickCaptureRoutes);
app.use("/timeline", timelineRoutes);

// Development-only routes
if (process.env.NODE_ENV !== "production") {
  app.use("/dev", simulatorRoutes);
}

// 404 response
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

// Centralized error handler
app.use((error, req, res, next) => {
  console.error("Atlas server error:", error);

  res.status(error.status || 500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "production"
        ? undefined
        : error.message,
  });
});

async function bootstrap() {
  const { assertProductionReadinessSync } = require("./core/productionReadinessValidator");
  assertProductionReadinessSync();
  await assertProductionReadinessAsync();

  const { runStartupValidation } = require("./core/engineeringGuardrails");
  const guardrailReport = await runStartupValidation({ failFast: true });

  if (guardrailReport.warnings?.length) {
    console.warn(
      `[guardrails] Startup completed with ${guardrailReport.warnings.length} warning(s).`
    );
    guardrailReport.warnings.forEach((warning) => {
      console.warn(`  - ${warning.code}: ${warning.message}`);
    });
  }

  console.log(`✅ Engineering guardrails passed (${guardrailReport.sprint})`);

  registerRecruitingWorkflow({
    prospectService: prospectModule.service,
    businessEventService: businessEventModule.service,
    prospectRepository: prospectModule.repository
  });

  await projectionModule.engine.register(timelineModule.timelineProjection);
  await projectionModule.engine.register(missionControlModule.missionControlProjection);
  await projectionModule.engine.register(executiveDashboardModule.executiveDashboardProjection);
  projectionModule.engine.start();
  workflowModule.registerAppointmentEventHandlers();

  app.listen(PORT, () => {
    logMetaEnvironmentWarnings();

    console.log(`🚀 Atlas AI running on http://localhost:${PORT}`);
    console.log(`🌎 Environment: ${process.env.NODE_ENV || "development"}`);

    if (isMetaReviewModeEnabled()) {
      console.log("📋 Meta Review Mode enabled — demo navigation and seed data active.");

      ensureMetaReviewDemoData({
        prospectService: prospectModule.service,
        businessEventService: businessEventModule.service,
        prospectRepository: prospectModule.repository
      }).catch((error) => {
        console.error("[meta-review] Demo seed failed:", error.message);
      });
    }
  });
}

async function main() {
  await bootstrap();
  const { startReminderPoller } = require("./services/appointmentReminderEngine");
  startReminderPoller(60_000);
  const { startNewLeadEscalationPoller } = require("./core/newLeadAttentionEngine");
  startNewLeadEscalationPoller(60_000);
}

main().catch((error) => {
  console.error("Atlas server bootstrap failed:", error);
  process.exit(1);
});
