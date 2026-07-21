/**
 * Release 1.4 — Mission Control presentation formats.
 */

function formatAsJson(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function formatMissionControl(snapshot, format = "json") {
  switch (format) {
    case "json":
    default:
      return formatAsJson(snapshot);
  }
}

module.exports = {
  formatMissionControl,
  formatAsJson
};
