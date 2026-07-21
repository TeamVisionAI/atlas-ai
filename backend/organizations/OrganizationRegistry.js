/**
 * Release 1.2 — In-memory organization registry.
 */

const organizationStore = require("./OrganizationStore");

class OrganizationRegistry {
  async register(record) {
    return organizationStore.saveOrganization(record);
  }

  async get(organizationId) {
    return organizationStore.getOrganization(organizationId);
  }

  async list() {
    return organizationStore.listOrganizations();
  }

  async remove(organizationId) {
    return organizationStore.deleteOrganization(organizationId);
  }
}

let singleton = null;

function getOrganizationRegistry() {
  if (!singleton) {
    singleton = new OrganizationRegistry();
  }

  return singleton;
}

function resetOrganizationRegistry() {
  singleton = null;
}

module.exports = {
  OrganizationRegistry,
  getOrganizationRegistry,
  resetOrganizationRegistry
};
