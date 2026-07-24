require("dotenv").config();

const express = require("express");
const cors = require("cors");

const healthRoute = require("./routes/health");
const infoRoute = require("./routes/info");
const recruitRoute = require("./routes/recruit");
const webhookRoute = require("./routes/webhook");
const messengerWebhookRoute = require("./routes/messengerWebhook");

const simulatorRoutes = require("./dev/simulatorRoutes");

const dashboardRoutes = require("./routes/dashboard");
const timelineRoutes = require("./routes/timeline");
const missionControlRoutes = require("./routes/missionControl");
const executiveDashboardRoutes = require("./routes/executiveDashboard");
const organizationRoutes = require("./routes/organization");
const quickCaptureRoutes = require("./routes/quickCapture");
const prospectWorkspaceRoutes = require("./routes/prospectWorkspace");
const prospectCenterRoutes = require("./routes/prospectCenter");
const metaOnboardingRoutes = require("./routes/metaOnboarding");
const knowledgeRoutes = require("./routes/knowledge");
const contactRoutes = require("./routes/contact");
const { createBusinessEventModule } = require("./modules/business-events");
const { createProjectionModule } = require("./modules/projections");
const { createProspectModule } = require("./modules/prospects");
const { createTimelineModule } = require("./modules/timeline");
const { createMissionControlModule } = require("./modules/mission-control");
const { createExecutiveDashboardModule } = require("./modules/executive-dashboard");
const { requireAtlasUser } = require("./middleware/requireAtlasUser");

const {
  logMetaEnvironmentWarnings,
} = require("./core/meta/metaEnvironmentValidator");

const businessEventModule = createBusinessEventModule({
  registerTimelineSubscriber: false
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

const prospectModule = createProspectModule({
  businessEventEngine: businessEventModule.prospectAdapter,
  prospectEventsHandler: businessEventModule.prospectEventsHandler
});

const app = express();
const PORT = process.env.PORT || 3000;

// General middleware
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

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

// Atlas application routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/mission-control", missionControlModule.routes);
app.use("/api/mission-control", missionControlRoutes);
app.use("/api/executive-dashboard", executiveDashboardModule.routes);
app.use("/api/executive-dashboard", executiveDashboardRoutes);
app.use("/api/prospect-workspace", prospectWorkspaceRoutes);
app.use("/api/prospect-center", prospectCenterRoutes);
app.use("/api/meta", metaOnboardingRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/business-events", businessEventModule.routes);
app.use("/api/timeline", timelineModule.routes);
app.get(
  "/api/prospects/:id/timeline",
  requireAtlasUser,
  timelineModule.prospectTimelineHandler
);
app.use("/api/prospects", prospectModule.routes);
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
  await projectionModule.engine.register(timelineModule.timelineProjection);
  await projectionModule.engine.register(missionControlModule.missionControlProjection);
  await projectionModule.engine.register(executiveDashboardModule.executiveDashboardProjection);
  projectionModule.engine.start();

  app.listen(PORT, () => {
    logMetaEnvironmentWarnings();

    console.log(`🚀 Atlas AI running on http://localhost:${PORT}`);
    console.log(`🌎 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

bootstrap().catch((error) => {
  console.error("Atlas server bootstrap failed:", error);
  process.exit(1);
});
