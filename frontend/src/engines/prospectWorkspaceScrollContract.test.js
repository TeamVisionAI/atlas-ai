import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROSPECT_WORKSPACE_SCROLL_ROOT_SELECTOR,
  assertWorkspaceScrollContract,
  isForbiddenWorkspaceScrollShell
} from "./prospectWorkspaceScrollContract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), "utf8");
}

test("1. workspace scroll container remains layout content", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const layoutCss = read("../layouts/MainLayout.css");
  const contract = assertWorkspaceScrollContract({
    pageSource: page,
    cssSource: read("../pages/ProspectWorkspace.css")
  });

  assert.equal(contract.ok, true, contract.violations.join("; "));
  assert.equal(contract.scrollRootSelector, PROSPECT_WORKSPACE_SCROLL_ROOT_SELECTOR);
  assert.match(page, /data-workspace-scroll-owner="atlas-layout-content"/);
  assert.match(
    layoutCss,
    /\.atlas-layout__content:has\(\.prospect-workspace\)\s*\{[^}]*overflow-y:\s*auto/s
  );
});

test("2-4. nested shell scroll hijack removed; sticky does not own scroll", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const workspaceCss = read("../pages/ProspectWorkspace.css");
  const stickyCss = read(
    "../features/prospect-workspace/components/ProspectStickyIdentityHeader.css"
  );

  assert.doesNotMatch(page, /prospect-workspace--shell/);
  assert.doesNotMatch(page, /prospect-workspace__scroll-body/);
  assert.doesNotMatch(workspaceCss, /prospect-workspace--shell/);
  assert.doesNotMatch(workspaceCss, /overflow-y:\s*auto/);
  assert.match(stickyCss, /pointer-events:\s*none/);
  assert.match(stickyCss, /position:\s*sticky/);
});

test("5-8. deep page sections remain in document order after sticky", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const stickyIdx = page.indexOf("<ProspectStickyIdentityHeader");
  const primaryIdx = page.indexOf("data-prospect-primary-header");
  const interviewIdx = page.indexOf("<OperationalWorkspace");
  const historyIdx = page.indexOf("<CommunicationHistorySection");
  const detailsIdx = page.indexOf("<ProspectDetailsPanel");

  assert.ok(stickyIdx > 0);
  assert.ok(primaryIdx > stickyIdx);
  assert.ok(interviewIdx > primaryIdx);
  assert.ok(historyIdx > interviewIdx);
  assert.ok(detailsIdx > historyIdx);
  assert.match(page, /<OperationalWorkspace/);
  assert.match(page, /<CommunicationHistorySection/);
});

test("9-12. sticky activation uses layout scroll root without nested ownership", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  assert.match(page, /resolveProspectWorkspaceScrollRoot/);
  assert.match(page, /IntersectionObserver/);
  assert.doesNotMatch(page, /scrollBodyRef/);
  assert.equal((page.match(/<ProspectStickyIdentityHeader/g) || []).length, 1);
});

test("13. anchors and dialogs remain outside sticky-only controls", () => {
  const sticky = read(
    "../features/prospect-workspace/components/ProspectStickyIdentityHeader.jsx"
  );
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");

  assert.match(sticky, /#operational-interview/);
  assert.match(sticky, /#communication-history/);
  assert.match(sticky, /workspaceStickyBackToTop/);
  assert.match(page, /ScheduleInterviewDialog/);
  assert.match(page, /CommunicationPreviewDialog/);
  assert.doesNotMatch(sticky, /onMissionAction|Reschedule|send_zoom_link/);
});

test("14-16. no operational side effects / Meta Review untouched", () => {
  const stickyEngine = read("./prospectWorkspaceStickyIdentity.js");
  const scrollContract = read("./prospectWorkspaceScrollContract.js");

  assert.doesNotMatch(stickyEngine, /createAppointment|updateCalendarEvent|sendTextMessage/);
  assert.doesNotMatch(scrollContract, /createAppointment|whatsapp|calendar/i);
  assert.equal(fs.existsSync(path.join(__dirname, "../config/metaReviewMode.js")), true);
});

test("forbidden shell helper recognizes nested hijacks", () => {
  assert.equal(
    isForbiddenWorkspaceScrollShell({ classList: { contains: (c) => c === "prospect-workspace--shell" } }),
    true
  );
  assert.equal(
    isForbiddenWorkspaceScrollShell({
      classList: { contains: (c) => c === "prospect-workspace__scroll-body" }
    }),
    true
  );
  assert.equal(
    isForbiddenWorkspaceScrollShell({ classList: { contains: () => false } }),
    false
  );
});
