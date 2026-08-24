import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProspectRoutePhone } from "./prospectRoutePhone.js";

test("normalizeProspectRoutePhone decodes encoded plus phone", () => {
  assert.equal(normalizeProspectRoutePhone("%2B12396288855"), "+12396288855");
  assert.equal(normalizeProspectRoutePhone("+12396288855"), "+12396288855");
});

test("normalizeProspectRoutePhone handles double-encoded plus", () => {
  assert.equal(normalizeProspectRoutePhone("%252B12396288855"), "+12396288855");
});
