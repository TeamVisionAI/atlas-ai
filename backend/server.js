require("dotenv").config();

const express = require("express");
const cors = require("cors");
const healthRoute = require("./routes/health");
const infoRoute = require("./routes/info");
const recruitRoute = require("./routes/recruit");
const webhookRoute = require("./routes/webhook");
const app = express();
const dashboardRoutes = require("./routes/dashboard");

app.use(cors());
app.use(express.json());
app.use("/api/dashboard", dashboardRoutes);

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
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Atlas AI running on http://localhost:${PORT}`);
});