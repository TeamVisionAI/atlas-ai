const constants = require("./constants");
const snapshot = require("./teamVisionDefaultSnapshot");
const validation = require("./validateRecruitingConfig");

module.exports = {
  ...constants,
  ...snapshot,
  ...validation
};
