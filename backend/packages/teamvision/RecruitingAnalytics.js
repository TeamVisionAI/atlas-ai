/**
 * Release 1.1 — Package-scoped recruiting analytics.
 */

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../../data/teamvisionAnalytics.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return createEmptyMetrics();
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return createEmptyMetrics();
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function createEmptyMetrics() {
  return {
    candidates: 0,
    qualified: 0,
    interviews: 0,
    interviewAttendance: 0,
    presentations: 0,
    joined: 0,
    licensingStarted: 0,
    licensingCompleted: 0,
    orientationCompleted: 0,
    fastStartCompleted: 0,
    followUpsStarted: 0,
    followUpsCompleted: 0
  };
}

class RecruitingAnalytics {
  track(eventName, payload = {}) {
    const store = readStore();

    switch (eventName) {
      case "package.candidate.qualified":
        store.candidates += 1;
        if (payload.qualified) {
          store.qualified += 1;
        }
        break;
      case "package.interview.scheduled":
        store.interviews += 1;
        break;
      case "package.interview.completed":
        store.interviewAttendance += 1;
        break;
      case "package.presentation.completed":
        store.presentations += 1;
        if (payload.outcome === "joined") {
          store.joined += 1;
        }
        break;
      case "package.license.started":
        store.licensingStarted += 1;
        break;
      case "package.license.completed":
        store.licensingCompleted += 1;
        break;
      case "package.orientation.completed":
        store.orientationCompleted += 1;
        break;
      case "package.faststart.completed":
        store.fastStartCompleted += 1;
        break;
      case "package.followup.started":
        store.followUpsStarted += 1;
        break;
      case "package.followup.completed":
        store.followUpsCompleted += 1;
        break;
      default:
        break;
    }

    writeStore(store);
    return store;
  }

  getMetrics() {
    const store = readStore();

    return {
      ...store,
      qualifiedPercent: store.candidates ? Math.round((store.qualified / store.candidates) * 100) : 0,
      attendancePercent: store.interviews
        ? Math.round((store.interviewAttendance / store.interviews) * 100)
        : 0,
      joinPercent: store.presentations
        ? Math.round((store.joined / store.presentations) * 100)
        : 0,
      licensingPercent: store.licensingStarted
        ? Math.round((store.licensingCompleted / store.licensingStarted) * 100)
        : 0,
      fastStartPercent: store.joined
        ? Math.round((store.fastStartCompleted / store.joined) * 100)
        : 0,
      orientationPercent: store.joined
        ? Math.round((store.orientationCompleted / store.joined) * 100)
        : 0,
      followUpCompletionPercent: store.followUpsStarted
        ? Math.round((store.followUpsCompleted / store.followUpsStarted) * 100)
        : 0
    };
  }

  clear() {
    writeStore(createEmptyMetrics());
  }
}

module.exports = {
  RecruitingAnalytics
};
