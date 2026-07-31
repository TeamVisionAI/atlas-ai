class WorkflowDomainError extends Error {
  constructor(message, { code = "WORKFLOW_DOMAIN_ERROR" } = {}) {
    super(message);
    this.name = "WorkflowDomainError";
    this.code = code;
  }
}

module.exports = {
  WorkflowDomainError
};
