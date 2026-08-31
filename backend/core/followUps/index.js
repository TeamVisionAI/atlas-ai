const constants = require("./constants");
const classification = require("./classification");
const outcomePolicy = require("./outcomePolicy");
const legacyCoverage = require("./legacyCoverage");
const prospectClosePolicy = require("./prospectClosePolicy");
const { createMemoryFollowUpStore } = require("./memoryStore");

module.exports = {
  ...constants,
  ...classification,
  ...outcomePolicy,
  ...legacyCoverage,
  ...prospectClosePolicy,
  createMemoryFollowUpStore
};
