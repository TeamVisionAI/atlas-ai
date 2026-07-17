const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");

async function postWorkflowAdvance(phone, body = {}) {
  return advanceProspectWorkflow(phone, body);
}

module.exports = {
  postWorkflowAdvance
};
