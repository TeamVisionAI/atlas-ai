/**
 * TikTok LIVE Engagements read-only UI contract.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("empty state copy and read-only page contract", () => {
  const page = fs.readFileSync(path.join(__dirname, "TiktokLiveEngagementsPage.jsx"), "utf8");
  const translations = fs.readFileSync(
    path.join(__dirname, "../i18n/translations.js"),
    "utf8"
  );
  const workspace = fs.readFileSync(
    path.join(__dirname, "../config/workspaceExperience.js"),
    "utf8"
  );
  assert.match(translations, /tiktokLiveEmpty: "No TikTok LIVE engagements captured yet\."/);
  assert.match(page, /translate\("tiktokLiveEmpty"\)/);
  assert.match(page, /StatusBadge/);
  assert.match(page, /tiktokLiveStatusCaptured/);
  assert.doesNotMatch(page, /onDelete|handleDelete|contentEditable/);
  assert.match(workspace, /tiktok-live-engagements/);
  assert.match(workspace, /navTiktokLiveEngagements/);
});
