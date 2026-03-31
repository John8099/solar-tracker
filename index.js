const express = require("express");
const cors = require("cors");
const path = require("path");
const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set, update } = require("firebase/database");

const app = express();
const port = process.env.PORT || 3000;
// const REPORT_INTERVAL_MS = 3000;
const REPORT_INTERVAL_MS = 2 * 60 * 60 * 1000;

const getFirebaseConfig = () => {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };

  const missingRequired = [
    "apiKey",
    "authDomain",
    "projectId",
    "databaseURL",
    "appId",
  ].filter((key) => !config[key]);

  if (missingRequired.length > 0) {
    return null;
  }

  return config;
};

const firebaseConfig = getFirebaseConfig();
const firebaseApp = firebaseConfig
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null;
const database = firebaseApp ? getDatabase(firebaseApp) : null;

const getDatabaseConfigError = () => ({
  error:
    "Firebase is not configured. Set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_DATABASE_URL, and FIREBASE_APP_ID.",
});

const getReportWindowStart = (timestamp) =>
  Math.floor(timestamp / REPORT_INTERVAL_MS) * REPORT_INTERVAL_MS;

const buildSystemStatusPayload = (payload, receivedAt) => ({
  ...payload,
  receivedAt,
});

const saveSystemStatusReport = async (payload, receivedAt) => {
  const reportWindowStart = getReportWindowStart(receivedAt);
  const reportWindowEnd = reportWindowStart + REPORT_INTERVAL_MS - 1;

  await set(ref(database, `system_status_reports/${reportWindowStart}`), {
    ...payload,
    reportWindowStart,
    reportWindowEnd,
    reportIntervalHours: 2,
    lastUpdatedAt: receivedAt,
  });
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "views")));

app.get("/api", (req, res) => {
  res.json({
    message: "Sun tracker API is running",
    firebaseConfigured: Boolean(database),
    databaseType: "realtime-database",
  });
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/reports", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "reports.html"));
});

app.get("/system-status", async (req, res) => {
  if (!database) {
    return res.status(500).json(getDatabaseConfigError());
  }

  try {
    const snapshot = await get(ref(database, "system_status"));

    if (!snapshot.exists()) {
      return res.status(404).json({
        error: "System status not found",
      });
    }

    return res.json(snapshot.val());
  } catch (error) {
    console.error("Failed to fetch system status:", error);

    return res.status(500).json({
      error: "Failed to fetch system status",
    });
  }
});

app.get("/system-status/reports", async (req, res) => {
  if (!database) {
    return res.status(500).json(getDatabaseConfigError());
  }

  try {
    const snapshot = await get(ref(database, "system_status_reports"));

    if (!snapshot.exists()) {
      return res.status(404).json({
        error: "System status reports not found",
      });
    }

    const reports = snapshot.val();
    const orderedReports = Object.keys(reports)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => ({
        id: key,
        ...reports[key],
      }));

    return res.json(orderedReports);
  } catch (error) {
    console.error("Failed to fetch system status reports:", error);

    return res.status(500).json({
      error: "Failed to fetch system status reports",
    });
  }
});

app.post("/system-status", async (req, res) => {
  if (!database) {
    return res.status(500).json(getDatabaseConfigError());
  }

  try {
    const receivedAt = Date.now();
    const systemStatusPayload = buildSystemStatusPayload(req.body, receivedAt);

    await update(ref(database, "system_status"), systemStatusPayload);
    await saveSystemStatusReport(systemStatusPayload, receivedAt);

    console.log(req.body);
    return res.status(200).json({
      message: "System status updated",
      reportIntervalHours: 2,
    });
  } catch (error) {
    console.error("Failed to save system status:", error);

    return res.status(500).json({
      error: "Failed to save system status",
    });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
