/**
 * Sprint 13.8 — BR-048 Personnel Directory.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPersonnelDirectoryEntries,
  filterAssignableUserRecords,
  isBlockedPersonnelAccount,
  listAssignableRepresentatives
} = require("../core/personnelDirectoryEngine");

const ORG_ID = "org-1";

function buildUser(overrides = {}) {
  return {
    id: overrides.id || "user-1",
    email: overrides.email || "rep@teamvision.ai",
    first_name: overrides.first_name || "Ana",
    last_name: overrides.last_name || "Perez",
    display_name: overrides.display_name,
    rep_id: overrides.rep_id || "4AAAA",
    status: overrides.status || "active",
    organization_id: overrides.organization_id || ORG_ID,
    role: overrides.role || "recruiter",
    photo_url: overrides.photo_url || null,
    archived_at: overrides.archived_at || null,
    ...overrides
  };
}

describe("Sprint 13.8 — BR-048 personnel directory", () => {
  it("filters inactive, operations, simulator, and blocked display names", () => {
    const filtered = filterAssignableUserRecords(
      [
        buildUser({ id: "active", display_name: "Ana Perez" }),
        buildUser({ id: "inactive", status: "disabled", display_name: "Disabled User" }),
        buildUser({ id: "ops", role: "operations", display_name: "Ops Access" }),
        buildUser({ id: "sim", email: "sim-test@teamvision.ai", display_name: "Sim User" }),
        buildUser({ id: "invite", display_name: "Invite Flow", role: "recruiter" }),
        buildUser({ id: "other-org", organization_id: "org-2", display_name: "Other Org" })
      ],
      ORG_ID
    );

    assert.deepEqual(
      filtered.map((user) => user.id),
      ["active"]
    );
  });

  it("deduplicates users by id", () => {
    const user = buildUser({ id: "dup", display_name: "Ana Perez" });
    const filtered = filterAssignableUserRecords([user, user], ORG_ID);

    assert.equal(filtered.length, 1);
  });

  it("sorts representatives alphabetically by display name", () => {
    const entries = buildPersonnelDirectoryEntries(
      [
        buildUser({ id: "c", display_name: "Carlos Hernandez" }),
        buildUser({ id: "a", display_name: "Ana Perez" }),
        buildUser({ id: "j", display_name: "Jessica Caballero" })
      ],
      ORG_ID
    );

    assert.deepEqual(
      entries.map((entry) => entry.displayName),
      ["Ana Perez", "Carlos Hernandez", "Jessica Caballero"]
    );
  });

  it("disambiguates duplicate display names with role suffixes only when needed", () => {
    const entries = buildPersonnelDirectoryEntries(
      [
        buildUser({
          id: "niovel-admin",
          display_name: "Niovel Perez",
          role: "administrator"
        }),
        buildUser({
          id: "niovel-rvp",
          display_name: "Niovel Perez",
          role: "rvp"
        }),
        buildUser({
          id: "ana",
          display_name: "Ana Perez",
          role: "recruiter"
        })
      ],
      ORG_ID
    );

    const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry.displayName]));

    assert.equal(byId["ana"], "Ana Perez");
    assert.equal(byId["niovel-admin"], "Niovel Perez • Administrator");
    assert.equal(byId["niovel-rvp"], "Niovel Perez • RVP");
  });

  it("returns future-ready metadata placeholders", () => {
    const [entry] = buildPersonnelDirectoryEntries(
      [buildUser({ id: "rep-1", display_name: "Ana Perez", photo_url: "https://cdn/ana.jpg" })],
      ORG_ID
    );

    assert.equal(entry.id, "rep-1");
    assert.equal(entry.displayName, "Ana Perez");
    assert.equal(entry.role, "recruiter");
    assert.equal(entry.avatarUrl, "https://cdn/ana.jpg");
    assert.equal(entry.isAvailable, true);
    assert.equal(entry.workload, null);
    assert.equal(entry.interviewEligible, true);
  });

  it("listAssignableRepresentatives uses injected organization user source", async () => {
    const representatives = await listAssignableRepresentatives(
      { organizationId: ORG_ID },
      {
        listOrganizationUsers: async () => [
          buildUser({ id: "demo", email: "demo-user@teamvision.ai" }),
          buildUser({ id: "valid", display_name: "Jessica Caballero" })
        ]
      }
    );

    assert.equal(representatives.length, 1);
    assert.equal(representatives[0].displayName, "Jessica Caballero");
  });

  it("blocks known service account display names", () => {
    assert.equal(isBlockedPersonnelAccount({ display_name: "Automation" }), true);
    assert.equal(isBlockedPersonnelAccount({ display_name: "Ana Perez" }), false);
  });
});
