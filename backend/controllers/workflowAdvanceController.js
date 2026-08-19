const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");

async function postWorkflowAdvance(phone, body = {}, options = {}) {
  const organizationId = options.organizationId || null;
  const { organizationId: _ignoredBodyOrg, ...safeBody } = body || {};

  return advanceProspectWorkflow(phone, {
    ...safeBody,
    organizationId
  });
}

module.exports = {
  postWorkflowAdvance
};
