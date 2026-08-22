/**
 * Agent workspace responsive polish — sidebar identity + prospect header contracts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sidebarCss = fs.readFileSync(
  path.join(__dirname, "../components/layout/SidebarUserFooter.css"),
  "utf8"
);
const sidebarJsx = fs.readFileSync(
  path.join(__dirname, "../components/layout/SidebarUserFooter.jsx"),
  "utf8"
);
const headerJsx = fs.readFileSync(
  path.join(__dirname, "../features/prospect-workspace/components/ProspectWorkspaceHeader.jsx"),
  "utf8"
);
const workspaceCss = fs.readFileSync(path.join(__dirname, "../pages/ProspectWorkspace.css"), "utf8");

test("sidebar identity keeps name, rep id, and business title lines", () => {
  assert.match(sidebarJsx, /sidebar-user-footer__name/);
  assert.match(sidebarJsx, /sidebar-user-footer__rep-id/);
  assert.match(sidebarJsx, /sidebar-user-footer__role/);
  assert.match(sidebarJsx, /getDisplayTitleLabelKey\(user\)/);
});

test("sidebar meta reserves width for chevron and only ellipsizes name", () => {
  assert.match(sidebarCss, /grid-template-columns:\s*auto minmax\(0, 1fr\) 16px/);
  assert.match(sidebarCss, /\.sidebar-user-footer__name[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(sidebarCss, /\.sidebar-user-footer__role[\s\S]*?white-space:\s*normal/);
});

test("prospect header groups actions and supports wrap", () => {
  assert.match(headerJsx, /prospect-workspace__toolbar-start/);
  assert.match(headerJsx, /prospect-workspace__toolbar-actions/);
  assert.match(workspaceCss, /\.prospect-workspace__toolbar[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(workspaceCss, /\.prospect-workspace__toolbar-actions[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(workspaceCss, /min-width:\s*0/);
});

test("prospect header actions wrap before viewport overflow at laptop widths", () => {
  assert.match(workspaceCss, /@media \(max-width: 1280px\)[\s\S]*?flex-basis:\s*100%/);
});

test("mobile prospect toolbar stack preserved", () => {
  assert.match(workspaceCss, /@media \(max-width: 767px\)[\s\S]*?flex-direction:\s*column/);
});
