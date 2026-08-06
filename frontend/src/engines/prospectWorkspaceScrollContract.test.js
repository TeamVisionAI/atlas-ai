import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), "utf8");
}

test("sticky prospect identity header is fully disabled", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const stickyComponent = path.join(
    __dirname,
    "../features/prospect-workspace/components/ProspectStickyIdentityHeader.jsx"
  );
  const stickyEngine = path.join(__dirname, "./prospectWorkspaceStickyIdentity.js");

  assert.equal(fs.existsSync(stickyComponent), false);
  assert.equal(fs.existsSync(stickyEngine), false);
  assert.doesNotMatch(page, /ProspectStickyIdentityHeader/);
  assert.doesNotMatch(page, /IntersectionObserver/);
  assert.doesNotMatch(page, /stickyIdentityActive/);
  assert.doesNotMatch(page, /prospect-workspace--shell/);
  assert.doesNotMatch(page, /prospect-workspace__scroll-body/);
  assert.match(page, /<ProspectHeader/);
});

test("layout main owns Prospect Workspace scroll without nested shells", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const layoutCss = read("../layouts/MainLayout.css");
  const workspaceCss = read("../pages/ProspectWorkspace.css");

  assert.match(page, /data-workspace-scroll-owner="atlas-layout-main"/);
  assert.match(
    layoutCss,
    /\.atlas-layout__main:has\(\.prospect-workspace\)\s*\{[^}]*overflow-y:\s*auto/s
  );
  assert.doesNotMatch(workspaceCss, /prospect-workspace--shell/);
  assert.doesNotMatch(workspaceCss, /prospect-workspace__scroll-body/);
  assert.doesNotMatch(workspaceCss, /overflow-y:\s*auto/);
  assert.doesNotMatch(layoutCss, /prospect-workspace--shell/);
});

test("deep page sections remain reachable in document order", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const headerIdx = page.indexOf("<ProspectHeader");
  const interviewIdx = page.indexOf("<OperationalWorkspace");
  const historyIdx = page.indexOf("<CommunicationHistorySection");
  const detailsIdx = page.indexOf("<ProspectDetailsPanel");

  assert.ok(headerIdx > 0);
  assert.ok(interviewIdx > headerIdx);
  assert.ok(historyIdx > interviewIdx);
  assert.ok(detailsIdx > historyIdx);
});

test("hotfix boundaries leave Interview, Communications Center, and Meta Review intact", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const interviewPanel = read(
    "../features/prospect-workspace/components/OperationalInterviewPanel.jsx"
  );

  assert.match(page, /CommunicationHistorySection/);
  assert.match(interviewPanel, /buildInterviewModuleCommunicationCards/);
  assert.equal(fs.existsSync(path.join(__dirname, "../config/metaReviewMode.js")), true);
  assert.doesNotMatch(page, /createAppointment|updateCalendarEvent|sendTextMessage/);
});
