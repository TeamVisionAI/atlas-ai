/**
 * Team Dashboard action-first UI contracts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES, roleHasPermission, PERMISSIONS } from "../security/workspacePermissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const teamDashboardSource = fs.readFileSync(path.join(__dirname, "../pages/TeamDashboard.jsx"), "utf8");
const teamDashboardCss = fs.readFileSync(path.join(__dirname, "../pages/TeamDashboard.css"), "utf8");
const translations = fs.readFileSync(path.join(__dirname, "../i18n/translations.js"), "utf8");
const workspaceSource = fs.readFileSync(path.join(__dirname, "../config/workspaceExperience.js"), "utf8");

test("A. RVP still routes to Executive Dashboard", () => {
  assert.match(workspaceSource, /getDefaultLandingPath/);
  assert.match(workspaceSource, /DASHBOARD_EXECUTIVE/);
  assert.match(workspaceSource, /executive-dashboard/);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.DASHBOARD_EXECUTIVE), true);
});

test("B/C. RL and REP route to Team Dashboard", () => {
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.DASHBOARD_EXECUTIVE), false);
  assert.match(workspaceSource, /team-dashboard/);
});

test("H. Team Dashboard does not render Agency Health or executive embed", () => {
  assert.doesNotMatch(teamDashboardSource, /import ExecutiveDashboard/);
  assert.doesNotMatch(teamDashboardSource, /AgencyHealth/);
  assert.doesNotMatch(teamDashboardSource, /TeamInterviewBoard/);
  assert.doesNotMatch(teamDashboardSource, /InterviewsHero/);
});

test("D/E. adaptive hierarchy via appointments title key", () => {
  const viewModelSource = fs.readFileSync(
    path.join(__dirname, "../engines/teamDashboardViewModel.js"),
    "utf8"
  );
  assert.match(teamDashboardSource, /viewModel\.appointments\.titleKey/);
  assert.match(viewModelSource, /teamDashAppointmentsMine/);
  assert.match(viewModelSource, /teamDashAppointmentsTeam/);
});

test("I. no empty Team Interview Board when no descendants", () => {
  assert.doesNotMatch(teamDashboardSource, /TeamInterviewBoard/);
});

test("J. KPI cards are clickable links", () => {
  assert.match(teamDashboardSource, /team-dash__kpi/);
  assert.match(teamDashboardSource, /<Link className="team-dash__kpi"/);
});

test("K. Spanish labels exist in translations", () => {
  assert.match(translations, /teamDashKpiNewProspects: "Prospectos nuevos"/);
  assert.match(translations, /teamDashPrioritiesTitle: "Prioridades de hoy"/);
  assert.match(translations, /teamDashRecommendTitle: "Recomendación de Atlas"/);
});

test("L. responsive layout classes present", () => {
  assert.match(teamDashboardCss, /@media \(max-width: 1024px\)/);
  assert.match(teamDashboardCss, /grid-template-columns: repeat\(4/);
  assert.match(teamDashboardCss, /grid-template-columns: 1fr/);
});

test("scoped data loads from hierarchy-filtered dashboard APIs only", () => {
  assert.match(teamDashboardSource, /getExecutiveDashboard\(\)/);
  assert.match(teamDashboardSource, /getDashboard\(\)/);
  assert.match(teamDashboardSource, /buildTeamDashboardViewModel/);
});
