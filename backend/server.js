require("dotenv").config();

const express = require("express");
const cors = require("cors");
const healthRoute = require("./routes/health");
const infoRoute = require("./routes/info");
const recruitRoute = require("./routes/recruit");
const webhookRoute = require("./routes/webhook");
const simulatorRoutes = require("./dev/simulatorRoutes");
const app = express();
const dashboardRoutes = require("./routes/dashboard");
const timelineRoutes = require("./routes/timeline");
const missionControlRoutes = require("./routes/missionControl");

app.use(cors());
app.use(express.json());
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/mission-control", missionControlRoutes);
app.use("/timeline", timelineRoutes);
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/", (req, res) => {
  res.json({
    app: "Atlas AI",
    version: "0.4.0",
    status: "running",
    message: "🚀 Atlas AI Backend Running"
  });
});
app.use("/health", healthRoute);
app.use("/api/info", infoRoute);
app.use("/api/recruit", recruitRoute);
app.use("/webhook", webhookRoute);
app.use("/dev", simulatorRoutes);
const PORT = process.env.PORT || 3000;
app.get("/atlas-test", (req, res) => {
  res.send("Atlas Test Route Works");
});

app.listen(PORT, () => {
  console.log(`🚀 Atlas AI running on http://localhost:${PORT}`);
});