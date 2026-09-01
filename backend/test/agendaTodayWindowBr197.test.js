/**
 * BR-197 — Today's Agenda uses a tenant-local today window.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resolveAppointmentViewFilters,
  matchesListFilters,
  SCHEDULED_VIEW_STATUSES
} = require("../core/appointmentListQuery");

const ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const SEP_1 = new Date("2026-09-01T15:00:00.000-04:00");

test("docs: BR-197 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-197/);
  assert.match(rules, /startOfToday/);
});

test("manual agenda item dated Aug 28 does not appear on Sep 1 today window", () => {
  const filters = resolveAppointmentViewFilters("today", SEP_1, { organizationId: ORG });
  assert.ok(filters.from);
  assert.ok(filters.to);
  assert.deepEqual(filters.status, SCHEDULED_VIEW_STATUSES);

  const stale = {
    organizationId: ORG,
    agentId: "agent-1",
    status: "scheduled",
    startDateTime: "2026-08-28T15:00:00.000-04:00",
    metadata: { standaloneAgenda: true }
  };
  const todayItem = {
    ...stale,
    startDateTime: "2026-09-01T10:00:00.000-04:00"
  };
  const future = {
    ...stale,
    startDateTime: "2026-09-03T10:00:00.000-04:00"
  };

  assert.equal(matchesListFilters(stale, filters, SEP_1), false);
  assert.equal(matchesListFilters(todayItem, filters, SEP_1), true);
  assert.equal(matchesListFilters(future, filters, SEP_1), false);
});

test("listPersistedAppointments expands view=today", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "../services/appointmentListService.js"),
    "utf8"
  );
  assert.match(service, /expandListFilters/);
  assert.match(service, /resolveAppointmentViewFilters/);
});
