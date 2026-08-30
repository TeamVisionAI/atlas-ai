const constants = require("./constants");
const preferences = require("./preferences");
const routing = require("./routing");
const dedup = require("./dedup");
const copy = require("./copy");
const { dispatchInAppNotification } = require("./dispatcher");
const { createMemoryNotificationStore } = require("./memoryStore");

module.exports = {
  ...constants,
  ...preferences,
  ...routing,
  ...dedup,
  ...copy,
  dispatchInAppNotification,
  createMemoryNotificationStore
};
