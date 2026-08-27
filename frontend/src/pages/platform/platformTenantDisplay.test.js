import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAssignFirstAdmin,
  filterTenantsForConsole,
  ownerAdminLabel,
  paginateItems
} from "./platformTenantDisplay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const overcomers = {
  id: "org-overcomers",
  name: "Team Overcomers",
  slug: "team-overcomers",
  ownerUserId: "97b290ea-4103-4117-acf5-60f389728b08",
  hasFirstAdmin: true,
  firstAdmin: {
    id: "user-jossy",
    firstName: "Jossy",
    lastName: "Diaz",
    displayName: "Jossy Diaz",
    email: "jossy@overcomers.test",
    status: "pending_invitation",
    invitationPending: true
  }
};

describe("platform tenant owner display", () => {
  it("shows a pending first admin as name · Pending and never a UUID", () => {
    assert.equal(ownerAdminLabel(overcomers), "Jossy D. · Pending");
    assert.equal(canAssignFirstAdmin(overcomers), false);
    assert.doesNotMatch(ownerAdminLabel(overcomers), /97b290ea/);
  });

  it("hides assign when only an owner id exists", () => {
    const tenant = {
      id: "org-1",
      ownerUserId: "00000000-0000-4000-8000-000000000002",
      hasFirstAdmin: true,
      firstAdmin: null
    };
    assert.equal(canAssignFirstAdmin(tenant), false);
    assert.equal(ownerAdminLabel(tenant), "Assigned");
  });

  it("allows assign only when no first admin or owner exists", () => {
    assert.equal(canAssignFirstAdmin({ id: "new-org" }), true);
    assert.equal(ownerAdminLabel({ id: "new-org" }), "—");
  });

  it("search and pagination stay usable at 50+ tenants", () => {
    const tenants = Array.from({ length: 52 }, (_, index) => ({
      id: `org-${index}`,
      name: index === 7 ? "Team Overcomers" : `Tenant ${index}`,
      slug: `tenant-${index}`,
      lifecycleStatus: "TRIAL"
    }));
    const filtered = filterTenantsForConsole(tenants, { query: "overcomers" });
    assert.equal(filtered.length, 1);
    const page = paginateItems(tenants, 3, 25);
    assert.equal(page.pageCount, 3);
    assert.equal(page.items.length, 2);
    const clamped = paginateItems(tenants, 99, 25);
    assert.equal(clamped.page, 3);
    assert.equal(clamped.items.length, 2);
  });

  it("TablePagination uses pageSize inside the component, not at module scope", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../components/ui/TablePagination.jsx"),
      "utf8"
    );
    assert.doesNotMatch(source, /^void pageSize/m);
    assert.match(source, /\{pageSize\} per page/);
    assert.match(source, /export default function TablePagination/);
  });

  it("tenants page uses the shared overflow menu and hides raw owner ids", () => {
    const source = fs.readFileSync(path.join(__dirname, "PlatformTenantsPage.jsx"), "utf8");
    assert.match(source, /OverflowMenu/);
    assert.match(source, /canAssignFirstAdmin/);
    assert.match(source, /ownerAdminLabel/);
    assert.match(source, /Enter Support Mode/);
    assert.match(source, /setPage\(1\)/);
    assert.match(source, /TENANTS_PAGE_SIZE/);
    assert.doesNotMatch(source, /tenant\?\.ownerUserId \|\| "—"/);
    const menu = fs.readFileSync(
      path.join(__dirname, "../../components/ui/OverflowMenu.jsx"),
      "utf8"
    );
    assert.match(menu, /createPortal/);
    assert.match(menu, /openUp/);
  });
});
