/**
 * Journey #1 — JSON file organization store (development fallback).
 */

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../data/organizations.json");

const ONBOARDING_STEPS = Object.freeze([
  "meta",
  "calendar",
  "meeting_preferences",
  "activate",
  "complete"
]);

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { organizations: [], memberships: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { organizations: [], memberships: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function defaultSettings() {
  return {
    meeting_locations: {
      office: false,
      zoom: false,
      starbucks: false,
      custom: false
    },
    office_address: null,
    starbucks_preference: null,
    custom_location_name: null,
    custom_location_address: null,
    zoom_interview_url: null,
    meta_connected: false,
    meta_connected_at: null,
    facebook_connected: false,
    messenger_connected: false,
    whatsapp_status: "pending",
    calendar_connected: false,
    calendar_connected_at: null,
    calendar_refresh_token_encrypted: null
  };
}

function normalizeOrganization(record) {
  return {
    id: record.id,
    name: record.name,
    owner_user_id: record.owner_user_id,
    activated_at: record.activated_at || null,
    onboarding_step: record.onboarding_step || "meta",
    created_at: record.created_at,
    updated_at: record.updated_at,
    settings: {
      ...defaultSettings(),
      ...(record.settings || {})
    }
  };
}

async function findById(organizationId) {
  const store = readStore();
  const org = store.organizations.find((entry) => entry.id === organizationId);
  return org ? normalizeOrganization(org) : null;
}

async function findByOwnerUserId(userId) {
  const store = readStore();
  const org = store.organizations.find((entry) => entry.owner_user_id === userId);
  return org ? normalizeOrganization(org) : null;
}

async function findMembershipForUser(userId) {
  const store = readStore();
  const membership = store.memberships.find((entry) => entry.user_id === userId);

  if (!membership) {
    return null;
  }

  const organization = store.organizations.find((entry) => entry.id === membership.organization_id);

  if (!organization) {
    return null;
  }

  return {
    role: membership.role,
    organization: normalizeOrganization(organization)
  };
}

async function createOrganization({ name, ownerUserId }) {
  const store = readStore();
  const now = new Date().toISOString();
  const organization = normalizeOrganization({
    id: crypto.randomUUID(),
    name: name.trim(),
    owner_user_id: ownerUserId,
    activated_at: null,
    onboarding_step: "meta",
    created_at: now,
    updated_at: now,
    settings: defaultSettings()
  });

  store.organizations.push(organization);
  store.memberships.push({
    id: crypto.randomUUID(),
    organization_id: organization.id,
    user_id: ownerUserId,
    role: "admin",
    created_at: now
  });
  writeStore(store);

  return organization;
}

async function updateOrganization(organizationId, patch) {
  const store = readStore();
  const index = store.organizations.findIndex((entry) => entry.id === organizationId);

  if (index === -1) {
    return null;
  }

  const current = normalizeOrganization(store.organizations[index]);
  const updated = normalizeOrganization({
    ...current,
    ...patch,
    settings: {
      ...current.settings,
      ...(patch.settings || {})
    },
    updated_at: new Date().toISOString()
  });

  store.organizations[index] = updated;
  writeStore(store);
  return updated;
}

async function findFirstActivatedOrganization() {
  const store = readStore();
  const activated = store.organizations.find((entry) => entry.activated_at);
  return activated ? normalizeOrganization(activated) : null;
}

module.exports = {
  ONBOARDING_STEPS,
  findById,
  findByOwnerUserId,
  findMembershipForUser,
  findFirstActivatedOrganization,
  createOrganization,
  updateOrganization
};
