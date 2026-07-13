require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    app: "Atlas AI",
    version: "0.1.0",
    status: "running",
    message: "🚀 Atlas AI Backend Running"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Atlas AI running on http://localhost:${PORT}`);
});