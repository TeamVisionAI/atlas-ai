import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("mission action cards use the shared 2-column action-card grid", () => {
  const center = fs.readFileSync(
    path.join(root, "components/mission-control/MissionActionCenter.jsx"),
    "utf8"
  );
  const centerCss = fs.readFileSync(
    path.join(root, "components/mission-control/MissionActionCenter.css"),
    "utf8"
  );
  const communicationCss = fs.readFileSync(
    path.join(root, "components/mission-control/MissionControlPermanentActions.css"),
    "utf8"
  );
  const workspaceCss = fs.readFileSync(path.join(root, "pages/ProspectWorkspace.css"), "utf8");
  const workspacePanel = fs.readFileSync(
    path.join(root, "features/prospect-workspace/components/OperationalInterviewPanel.jsx"),
    "utf8"
  );

  assert.match(center, /mission-action-center__grid/);
  assert.doesNotMatch(center, /mission-action-center__list/);
  assert.match(centerCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(communicationCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(
    workspaceCss,
    /\.prospect-workspace__operational-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
  );
  assert.match(workspacePanel, /prospect-workspace__operational-actions--lifecycle/);
  assert.match(centerCss, /mission-action-card--expanded/);
  assert.match(centerCss, /grid-column:\s*1\s*\/\s*-1/);
});

test("collapsed expandable mission cards do not show wrapper chrome under the dark card", () => {
  const expandableCss = fs.readFileSync(
    path.join(root, "components/mission-control/ExpandableMissionActionCard.css"),
    "utf8"
  );
  const expandableJsx = fs.readFileSync(
    path.join(root, "components/mission-control/ExpandableMissionActionCard.jsx"),
    "utf8"
  );

  assert.match(expandableJsx, /mission-action-card--expanded/);
  assert.match(expandableJsx, /expanded \? \(/);
  assert.match(expandableCss, /\.mission-action-card\s*\{[^}]*background:\s*transparent/);
  assert.match(expandableCss, /\.mission-action-card\s*\{[^}]*border:\s*none/);
  assert.match(expandableCss, /\.mission-action-card\s*\{[^}]*height:\s*100%/);
  assert.match(expandableCss, /\.mission-action-card__header\s*\{[^}]*height:\s*100%/);
  assert.match(expandableCss, /\.mission-action-card--expanded\s*\{[^}]*background:\s*#ffffff/);
  assert.doesNotMatch(
    expandableCss,
    /\.mission-action-card\s*\{[^}]*background:\s*#ffffff/
  );
});
