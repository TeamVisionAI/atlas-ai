/**
 * Business rank display title prefers RL over permission role.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(path.join(__dirname, "workspaceExperience.js"), "utf8");
const footerSource = fs.readFileSync(
  path.join(__dirname, "../components/layout/SidebarUserFooter.jsx"),
  "utf8"
);
const translations = fs.readFileSync(path.join(__dirname, "../i18n/translations.js"), "utf8");

test("getDisplayTitleLabelKey prefers business_rank RL → Regional Leader", () => {
  assert.match(workspaceSource, /getDisplayTitleLabelKey/);
  assert.match(workspaceSource, /businessRankRl/);
  assert.match(translations, /businessRankRl:\s*"Regional Leader"/);
  assert.match(footerSource, /getDisplayTitleLabelKey\(user\)/);
  assert.doesNotMatch(footerSource, /getRoleLabelKey\(user\.role\)/);
});

test("Integrations settings require INTEGRATIONS_SELF (personal workspace)", () => {
  assert.match(
    workspaceSource,
    /settings\/integrations[\s\S]*?permission:\s*PERMISSIONS\.INTEGRATIONS_SELF/
  );
  assert.match(
    workspaceSource,
    /settings\/organization[\s\S]*?permission:\s*PERMISSIONS\.ORG_WRITE/
  );
});
