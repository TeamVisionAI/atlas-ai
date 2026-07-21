/**
 * Release 1.2 — Organization administration metrics.
 */

const organizationStore = require("./OrganizationStore");
const { enabledConnectors } = require("./OrganizationConnectors");

async function recalculateAnalytics() {
  const organizations = await organizationStore.listOrganizations();

  const languages = new Set();
  let activePackages = 0;
  let offices = 0;
  let users = 0;
  let enabledConnectorCount = 0;

  for (const org of organizations) {
    for (const language of org.profile?.supportedLanguages || []) {
      languages.add(language);
    }

    activePackages += (org.packages || []).filter((entry) => entry.enabled).length;
    offices += (org.locations || []).length;
    users += (org.users || []).length;
    enabledConnectorCount += enabledConnectors(org.connectors).length;
  }

  return organizationStore.updateAnalytics({
    organizations: organizations.length,
    activePackages,
    enabledConnectors: enabledConnectorCount,
    offices,
    users,
    languages: languages.size
  });
}

async function getAnalytics() {
  const store = organizationStore.readStore();
  return store.analytics;
}

module.exports = {
  recalculateAnalytics,
  getAnalytics
};
