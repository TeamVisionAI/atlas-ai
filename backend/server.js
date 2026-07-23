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
const organizationRoutes = require("./routes/organization");
const quickCaptureRoutes = require("./routes/quickCapture");
const prospectWorkspaceRoutes = require("./routes/prospectWorkspace");
const prospectCenterRoutes = require("./routes/prospectCenter");
const metaOnboardingRoutes = require("./routes/metaOnboarding");
const contactRoutes = require("./routes/contact");
const onboardingRoutes = require("./routes/onboarding");

const {
  logMetaEnvironmentWarnings,
} = require("./core/meta/metaEnvironmentValidator");
const { getCommunicationGateway } = require("./communication/gateway/createCommunicationGateway");

const app = express();
const PORT = process.env.PORT || 3000;

// General middleware
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Meta webhooks must receive the raw body before express.json().
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
app.use("/api/mission-control", missionControlRoutes);
app.use("/api/prospect-workspace", prospectWorkspaceRoutes);
app.use("/api/prospect-center", prospectCenterRoutes);
app.use("/api/meta", metaOnboardingRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api", onboardingRoutes);
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

const server = app.listen(PORT);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`   Run: lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
  } else {
    console.error("❌ Server failed to start:", error.message);
  }

  process.exit(1);
});

server.on("listening", async () => {
  logMetaEnvironmentWarnings();

  if (process.env.MESSENGER_PAGE_ACCESS_TOKEN) {
    try {
      const { messengerConnector } = getCommunicationGateway();
      await messengerConnector.connect();
      console.log("✅ Messenger connector connected");
    } catch (error) {
      console.warn("⚠️ Messenger connector failed to connect:", error.message);
    }
  }

  console.log(`🚀 Atlas AI running on http://localhost:${PORT}`);
  console.log(`🌎 Environment: ${process.env.NODE_ENV || "development"}`);
});