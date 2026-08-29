/**
 * BR-169 — Durable Recruit AI v2 tenant/user grant snapshot.
 * Injected into live authoring / execution eligibility. Fail-soft if tables
 * are missing so Railway allowlists still work during migration.
 */

const EMPTY_GRANT = Object.freeze({
  tenantCertified: false,
  tenantEnabled: false,
  tenantSuspended: false,
  authoringEnabled: false,
  executionEnabled: false,
  source: "none"
});

function emptyGrant(overrides = {}) {
  return { ...EMPTY_GRANT, ...overrides };
}

function grantAuthorizesAuthoring(grant) {
  if (!grant || grant.tenantSuspended === true) {
    return false;
  }
  return (
    grant.tenantCertified === true &&
    grant.tenantEnabled === true &&
    grant.authoringEnabled === true
  );
}

function grantAuthorizesExecution(grant) {
  if (!grant || grant.tenantSuspended === true) {
    return false;
  }
  return (
    grant.tenantCertified === true &&
    grant.tenantEnabled === true &&
    grant.executionEnabled === true
  );
}

module.exports = {
  EMPTY_GRANT,
  emptyGrant,
  grantAuthorizesAuthoring,
  grantAuthorizesExecution
};
