const express = require("express");
const cors = require("cors");
const path = require("path");

const satelliteRoute = require("./satelliteRoute");
const { checkConnection } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "satellite-backend" });
});

app.use("/api/satellite", satelliteRoute);

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  checkConnection();
});