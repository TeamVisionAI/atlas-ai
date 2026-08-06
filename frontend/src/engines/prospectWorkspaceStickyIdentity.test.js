import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafeStickySummary,
  buildProspectStickyIdentitySummary,
  maskProspectContact,
  stickySummaryContainsOperationalActions
} from "./prospectWorkspaceStickyIdentity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const translate = (key) =>
  ({
    workspaceStickyUnknownName: "Prospect",
    workspaceHeaderUnassigned: "Unassigned",
    workspaceHeaderUnknown: "Unknown",
    workspaceStatusSummaryUnknown: "Unknown",
    interviewWorkflowState_scheduled: "Interview Scheduled"
  })[key] || key;

const PROSPECT_ID = "f51cad82-d645-4f44-bdca-c802aaaaf3fd";
const RAW_PHONE = "+17865557082";

test("1. sticky summary renders prospect name", () => {
  const summary = buildProspectStickyIdentitySummary({
    prospectId: PROSPECT_ID,
    identity: { name: "Ofelia Mutis", phone: RAW_PHONE, communicationLanguage: "English" },
    status: { milestone: "Interview Scheduled" },
    owner: { display_name: "Ana Rivera" },
    interview: {
      datetime: "2026-08-07T17:51:00.000Z",
      type: "zoom",
      appointmentStatus: "scheduled",
      appointmentId: "d0e0edb9-13ee-4d72-82ff-7d696a9b950f"
    },
    translate
  });

  assert.equal(summary.name, "Ofelia Mutis");
});

test("2. prospect ID is used as identity", () => {
  const summary = buildProspectStickyIdentitySummary({
    prospectId: PROSPECT_ID,
    identity: { name: "Ofelia Mutis", phone: RAW_PHONE },
    translate
  });

  assert.equal(summary.prospectId, PROSPECT_ID);
});

test("3. masked contact only", () => {
  assert.equal(maskProspectContact(RAW_PHONE), "+*******7082");
  const summary = buildProspectStickyIdentitySummary({
    prospectId: PROSPECT_ID,
    identity: { name: "Ofelia Mutis", phone: RAW_PHONE },
    translate
  });
  assert.equal(summary.maskedContact, "+*******7082");
});

test("4. raw phone not shown", () => {
  const summary = buildProspectStickyIdentitySummary({
    prospectId: PROSPECT_ID,
    identity: { name: "Ofelia Mutis", phone: RAW_PHONE },
    translate
  });
  assert.equal(JSON.stringify(summary).includes(RAW_PHONE), false);
  assert.doesNotThrow(() => assertSafeStickySummary(summary, RAW_PHONE));
});

test("5. raw enum values not shown", () => {
  const summary = buildProspectStickyIdentitySummary({
    prospectId: PROSPECT_ID,
    identity: { name: "Ofelia Mutis", phone: RAW_PHONE },
    interview: {
      datetime: "2026-08-07T17:51:00.000Z",
      type: "in_person",
      appointmentStatus: "scheduled",
      appointmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    },
    translate
  });

  assert.equal(summary.appointmentTypeLabel, "In Person");
  assert.match(summary.appointmentStatusLabel, /Interview Scheduled|Scheduled/i);
  assert.equal(summary.appointmentTypeLabel.includes("_"), false);
  assert.equal(summary.appointmentStatusLabel.includes("in_person"), false);
});

test("6. canonical appointment status/time shown", () => {
  const summary = buildProspectStickyIdentitySummary({
    prospectId: PROSPECT_ID,
    identity: { name: "Ofelia Mutis", phone: RAW_PHONE },
    interview: {
      datetime: "2026-08-07T17:51:00.000Z",
      type: "zoom",
      appointmentStatus: "scheduled",
      appointmentId: "d0e0edb9-13ee-4d72-82ff-7d696a9b950f"
    },
    translate
  });

  assert.ok(summary.appointmentWhen);
  assert.ok(summary.hasScheduledInterview);
  assert.equal(summary.appointmentTypeLabel, "Zoom");
});

test("7-8. sticky wiring uses one sticky header and primary sentinel", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "../features/prospect-workspace/pages/ProspectWorkspacePage.jsx"),
    "utf8"
  );

  assert.match(page, /ProspectStickyIdentityHeader/);
  assert.match(page, /data-prospect-primary-header/);
  assert.match(page, /IntersectionObserver/);
  assert.equal((page.match(/<ProspectStickyIdentityHeader/g) || []).length, 1);
  assert.equal((page.match(/<ProspectHeader/g) || []).length, 1);
  assert.doesNotMatch(page, /prospect-workspace--shell/);
  assert.match(page, /data-workspace-scroll-owner="atlas-layout-content"/);
  assert.match(page, /data-prospect-id=\{prospectCoreId/);
});

test("9-10. desktop meta and mobile expand exist in component CSS/markup", () => {
  const component = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/ProspectStickyIdentityHeader.jsx"
    ),
    "utf8"
  );
  const css = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/ProspectStickyIdentityHeader.css"
    ),
    "utf8"
  );

  assert.match(component, /prospect-sticky-identity__desktop-meta/);
  assert.match(component, /workspaceStickyExpand/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /prefers-reduced-motion/);
});

test("11. Back to top and anchors present", () => {
  const component = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/ProspectStickyIdentityHeader.jsx"
    ),
    "utf8"
  );
  assert.match(component, /workspaceStickyBackToTop/);
  assert.match(component, /#operational-interview/);
  assert.match(component, /#communication-history/);
});

test("12. no operational actions duplicated in sticky header", () => {
  const component = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/ProspectStickyIdentityHeader.jsx"
    ),
    "utf8"
  );
  assert.equal(stickySummaryContainsOperationalActions(component), false);
  assert.doesNotMatch(component, /onMissionAction|Reschedule|Complete Interview|Cancel Interview/);
});

test("13-17. boundaries unchanged (Communications Center, Interview panel, Meta Review, no writes)", () => {
  const stickyEngine = fs.readFileSync(
    path.join(__dirname, "./prospectWorkspaceStickyIdentity.js"),
    "utf8"
  );
  const page = fs.readFileSync(
    path.join(__dirname, "../features/prospect-workspace/pages/ProspectWorkspacePage.jsx"),
    "utf8"
  );
  const interviewPanel = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/OperationalInterviewPanel.jsx"
    ),
    "utf8"
  );

  assert.doesNotMatch(stickyEngine, /createAppointment|updateCalendarEvent|sendTextMessage/);
  assert.match(page, /CommunicationsCenterTimeline|CommunicationHistorySection/);
  assert.match(interviewPanel, /buildInterviewModuleCommunicationCards/);
  assert.match(interviewPanel, /onMissionAction\?\.\(card\.id\)/);
  assert.equal(
    fs.existsSync(path.join(__dirname, "../config/metaReviewMode.js")),
    true
  );
});

test("sticky inactive uses aria-hidden to reduce screen-reader duplication", () => {
  const component = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/ProspectStickyIdentityHeader.jsx"
    ),
    "utf8"
  );
  assert.match(component, /aria-hidden=\{active \? undefined : true\}/);
  assert.match(component, /data-sticky-active/);
});
