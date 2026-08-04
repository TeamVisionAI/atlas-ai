require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveLoginIdentifier,
  sanitizeUser,
  buildAdminUserSearchFilter
} = require("../services/atlasUserService");
const { normalizeRepId } = require("../core/repIdEngine");

test("resolveLoginIdentifier routes email addresses to email mode", () => {
  assert.deepEqual(resolveLoginIdentifier("Ana@Example.com"), {
    mode: "email",
    value: "ana@example.com"
  });
});

test("resolveLoginIdentifier routes non-email values to rep_id mode", () => {
  assert.deepEqual(resolveLoginIdentifier("4XHKH"), {
    mode: "rep_id",
    value: "4XHKH"
  });
});

test("resolveLoginIdentifier returns null mode for blank identifiers", () => {
  assert.deepEqual(resolveLoginIdentifier("   "), { mode: null, value: null });
});

test("sanitizeUser exposes rep_id in profile DTOs", () => {
  const dto = sanitizeUser({
    id: "00000000-0000-4000-8000-000000000099",
    email: "ana@example.com",
    first_name: "Ana",
    last_name: "Perez",
    role: "rvp",
    status: "active",
    organization_id: "00000000-0000-4000-8000-000000000001",
    rep_id: "4XHKH"
  });

  assert.equal(dto.rep_id, "4XHKH");
  assert.equal(dto.meta_review_user, false);
});

test("sanitizeUser exposes meta_review_user only for dedicated review accounts", () => {
  const reviewDto = sanitizeUser({
    id: "00000000-0000-4000-8000-000000000100",
    email: "review@example.com",
    first_name: "Meta",
    last_name: "Reviewer",
    role: "recruiter",
    status: "active",
    organization_id: "00000000-0000-4000-8000-000000000001",
    profile_settings: { meta_review_user: true }
  });

  const adminDto = sanitizeUser({
    id: "00000000-0000-4000-8000-000000000101",
    email: "admin@example.com",
    first_name: "Niovel",
    last_name: "Perez",
    role: "administrator",
    status: "active",
    organization_id: "00000000-0000-4000-8000-000000000001",
    profile_settings: {}
  });

  assert.equal(reviewDto.meta_review_user, true);
  assert.equal(adminDto.meta_review_user, false);
  assert.equal(Object.prototype.hasOwnProperty.call(reviewDto, "profile_settings"), false);
});

test("buildAdminUserSearchFilter includes rep_id for name and Rep ID search", () => {
  const filter = buildAdminUserSearchFilter("4XHKH");

  assert.match(filter, /rep_id\.ilike\.%4XHKH%/);
  assert.match(filter, /first_name\.ilike\.%4XHKH%/);
});

test("normalizeRepId uppercases Rep ID login identifiers before lookup", () => {
  assert.equal(normalizeRepId("4tjlk"), "4TJLK");
});

test("invalid Rep ID values fail validation for admin writes", () => {
  assert.throws(() => normalizeRepId("BAD"), (error) => error.publicCode === "INVALID_REP_ID");
});

test("email login backward compatibility keeps email mode for @ identifiers", () => {
  const resolved = resolveLoginIdentifier("niovel@teamvision.ai");
  assert.equal(resolved.mode, "email");
  assert.equal(resolved.value, "niovel@teamvision.ai");
});

test("Rep ID login uses rep_id mode for alphanumeric identifiers", () => {
  const resolved = resolveLoginIdentifier("4TJLK");
  assert.equal(resolved.mode, "rep_id");
  assert.equal(normalizeRepId(resolved.value), "4TJLK");
});

test("My Account and sidebar DTOs include rep_id when assigned", () => {
  const dto = sanitizeUser({
    id: "1",
    email: "niovel@teamvision.ai",
    first_name: "Niovel",
    last_name: "Perez",
    role: "rvp",
    status: "active",
    organization_id: "org-1",
    rep_id: "4TJLK"
  });

  assert.equal(dto.first_name, "Niovel");
  assert.equal(dto.rep_id, "4TJLK");
});

test("admin user search matches Ana by first name and 4XHKH by rep_id", () => {
  assert.match(buildAdminUserSearchFilter("Ana"), /first_name\.ilike\.%Ana%/);
  assert.match(buildAdminUserSearchFilter("4XHKH"), /rep_id\.ilike\.%4XHKH%/);
});
