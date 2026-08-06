import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), "utf8");
}

test("sticky prospect identity header remains disabled", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  assert.equal(
    fs.existsSync(
      path.join(
        __dirname,
        "../features/prospect-workspace/components/ProspectStickyIdentityHeader.jsx"
      )
    ),
    false
  );
  assert.doesNotMatch(page, /ProspectStickyIdentityHeader/);
  assert.doesNotMatch(page, /IntersectionObserver/);
  assert.doesNotMatch(page, /prospect-workspace--shell/);
  assert.doesNotMatch(page, /prospect-workspace__scroll-body/);
  assert.match(page, /<ProspectHeader/);
});

test("no Prospect Workspace-specific scroll ownership via :has() overflow rules", () => {
  const layoutCss = read("../layouts/MainLayout.css");
  const workspaceCss = read("../pages/ProspectWorkspace.css");
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");

  // Pre-PR #26 baseline: card chrome :has() may remain, but not scroll overflow ownership.
  assert.doesNotMatch(
    layoutCss,
    /\.atlas-layout__main:has\(\.prospect-workspace\)\s*\{[^}]*overflow-y:\s*auto/s
  );
  assert.doesNotMatch(
    layoutCss,
    /\.atlas-layout__content:has\(\.prospect-workspace\)\s*\{[^}]*overflow-y:\s*auto/s
  );
  assert.doesNotMatch(layoutCss, /prospect-workspace--shell/);
  assert.doesNotMatch(workspaceCss, /prospect-workspace--shell/);
  assert.doesNotMatch(workspaceCss, /prospect-workspace__scroll-body/);
  assert.doesNotMatch(page, /data-workspace-scroll-owner/);
});

test("deep page sections remain in document order", () => {
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

test("Interview, Communications Center, and Meta Review boundaries remain intact", () => {
  const page = read("../features/prospect-workspace/pages/ProspectWorkspacePage.jsx");
  const interviewPanel = read(
    "../features/prospect-workspace/components/OperationalInterviewPanel.jsx"
  );

  assert.match(page, /CommunicationHistorySection/);
  assert.match(interviewPanel, /buildInterviewModuleCommunicationCards/);
  assert.equal(fs.existsSync(path.join(__dirname, "../config/metaReviewMode.js")), true);
});
