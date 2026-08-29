/**
 * Admin Users grid helpers — display filters, badges, actions menu contract.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  USERS_DEFAULT_STATUS_FILTER,
  buildUserRowActions,
  displayUserName,
  filterAdminUsers,
  formatStatusLabel,
  invitationDisplayStatus,
  statusBadgeClass
} from "./adminUsersGridHelpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminUsersSource = fs.readFileSync(path.join(__dirname, "AdminUsers.jsx"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "identity.css"), "utf8");

const sampleUsers = [
  {
    id: "1",
    first_name: "Ada",
    last_name: "Active",
    email: "ada@example.com",
    rep_id: "AAAA1",
    business_rank: "RL",
    role: "division_leader",
    status: "active"
  },
  {
    id: "2",
    first_name: "Pat",
    last_name: "Pending",
    email: "pat@example.com",
    rep_id: null,
    business_rank: "REP",
    role: "recruiter",
    status: "pending_invitation",
    invitation: { status: "pending", expires_at: "2099-01-01T00:00:00.000Z" }
  },
  {
    id: "3",
    first_name: "Arch",
    last_name: "Ived",
    email: "arch@example.com",
    business_rank: "DIS",
    role: "agent",
    status: "archived"
  }
];

test("default filter keeps active + pending and excludes archived", () => {
  const filtered = filterAdminUsers(sampleUsers, {
    statusFilter: USERS_DEFAULT_STATUS_FILTER
  });
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every((u) => u.status === "active" || u.status === "pending_invitation"));
});

test("search matches name, email, and Rep ID", () => {
  assert.equal(filterAdminUsers(sampleUsers, { query: "ada" }).length, 1);
  assert.equal(filterAdminUsers(sampleUsers, { query: "pat@example" }).length, 1);
  assert.equal(filterAdminUsers(sampleUsers, { query: "aaaa1" }).length, 1);
});

test("rank and role filters are tenant-neutral stored values", () => {
  assert.equal(filterAdminUsers(sampleUsers, { rankFilter: "RL" })[0].id, "1");
  assert.equal(filterAdminUsers(sampleUsers, { roleFilter: "recruiter" })[0].id, "2");
});

test("pending invite actions exclude force logout/reset", () => {
  const actions = buildUserRowActions(sampleUsers[1]);
  assert.deepEqual(
    actions.map((a) => a.id),
    ["invite", "revoke-invite"]
  );
});

test("active user actions include name edit / suspend / reset / logout / archive / capabilities", () => {
  const actions = buildUserRowActions(sampleUsers[0]);
  assert.ok(actions.some((a) => a.id === "suspend"));
  assert.ok(actions.some((a) => a.id === "reset"));
  assert.ok(actions.some((a) => a.id === "logout"));
  assert.ok(actions.some((a) => a.id === "archive"));
  assert.ok(actions.some((a) => a.id === "edit-name"));
  assert.ok(actions.some((a) => a.id === "edit-email"));
  assert.ok(actions.some((a) => a.id === "edit-rep"));
  assert.ok(actions.some((a) => a.id === "edit-capabilities"));
  assert.equal(actions.some((a) => a.id === "edit-v2"), false);
});

test("Recruit AI v2 grant action appears only when tenant Admin may manage grants", () => {
  const hidden = buildUserRowActions(sampleUsers[0], { canManageV2: false });
  const visible = buildUserRowActions(sampleUsers[0], { canManageV2: true });
  assert.equal(hidden.some((a) => a.id === "edit-v2"), false);
  assert.ok(visible.some((a) => a.id === "edit-v2"));
});

test("seeded-shaped users still get Edit Name without changing identity actions", () => {
  const seeded = {
    id: "00000000-0000-4000-8000-000000000001",
    first_name: "Ana",
    last_name: "Ana",
    display_name: "Ana Ana",
    email: "ana@example.com",
    status: "active",
    role: "recruiter"
  };
  const actions = buildUserRowActions(seeded);
  assert.ok(actions.some((a) => a.id === "edit-name"));
  assert.ok(actions.some((a) => a.id === "edit-email"));
  assert.equal(actions.some((a) => a.id === "transfer-ownership"), false);
  assert.equal(displayUserName(seeded), "Ana Ana");
});

test("status labels and badges are compact", () => {
  assert.equal(formatStatusLabel("pending_invitation"), "Pending");
  assert.equal(formatStatusLabel("active"), "Active");
  assert.match(statusBadgeClass("pending"), /pending/);
  assert.equal(invitationDisplayStatus(sampleUsers[1]), "pending");
  assert.equal(displayUserName(sampleUsers[0]), "Ada Active");
});

test("AdminUsers grid UI structure is present", () => {
  assert.match(adminUsersSource, /admin-users-toolbar/);
  assert.match(adminUsersSource, /Search users/);
  assert.match(adminUsersSource, /Invite User/);
  assert.match(adminUsersSource, /OverflowMenu|•••/);
  assert.match(adminUsersSource, /createPortal|OverflowMenu/);
  assert.match(adminUsersSource, /admin-users-mobile/);
  assert.match(adminUsersSource, /Active \+ Pending/);
  assert.match(adminUsersSource, /startNameEdit/);
  assert.match(adminUsersSource, /startEmailEdit/);
  assert.match(adminUsersSource, /changeAdminUserEmail/);
  assert.match(adminUsersSource, /updateAdminUser\(userId, \{ firstName, lastName \}\)/);
  assert.doesNotMatch(adminUsersSource, /Team Vision hierarchy/);
  assert.doesNotMatch(adminUsersSource, /00000000-0000-4000-8000-000000000001/);
  assert.doesNotMatch(adminUsersSource, /af8fb707-f26c-4152-ad77-2d079d30bc8a/);
  assert.match(adminUsersSource, /admin-recruit-ai-v2-panel/);
  assert.match(adminUsersSource, /Execution is never implied by authoring or role/);
});

test("CSS provides sticky header, badges, and responsive cards", () => {
  assert.match(cssSource, /position:\s*sticky/);
  assert.match(cssSource, /admin-users-badge/);
  assert.match(cssSource, /admin-users-mobile/);
  assert.match(cssSource, /admin-users-row--pending/);
  assert.match(cssSource, /height:\s*60px/);
});
