/** @deprecated Import from domain/value-objects/ProspectStatus.js */
const { ProspectStatus } = require("../domain/value-objects/ProspectStatus");

module.exports = {
  isValidLifecycleState: ProspectStatus.isValidState,
  assertLifecycleTransition: ProspectStatus.assertTransition
};
