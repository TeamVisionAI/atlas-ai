/**
 * Conversations My Prospects / Team Prospects tab resolution.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONVERSATIONS_WORKSPACE_SCOPES,
  CONVERSATIONS_WORKSPACE_TABS,
  canSeeConversationsTeamProspects,
  resolveConversationsWorkspaceTab
} from "./conversationsWorkspaceScope.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("default tab is My Prospects / mine", () => {
  const resolved = resolveConversationsWorkspaceTab({
    workspaceScopeParam: "",
    canSeeTeam: true
  });
  assert.equal(resolved.tab, CONVERSATIONS_WORKSPACE_TABS.MINE);
  assert.equal(resolved.workspaceScope, CONVERSATIONS_WORKSPACE_SCOPES.MINE);
  assert.equal(resolved.unauthorizedTeam, false);
});

test("authorized leader can open Team Prospects", () => {
  assert.equal(canSeeConversationsTeamProspects({ role: "rvp" }), true);
  assert.equal(canSeeConversationsTeamProspects({ role: "administrator" }), true);
  assert.equal(canSeeConversationsTeamProspects({ role: "division_leader" }), true);

  const resolved = resolveConversationsWorkspaceTab({
    workspaceScopeParam: "oversight",
    canSeeTeam: true
  });
  assert.equal(resolved.tab, CONVERSATIONS_WORKSPACE_TABS.TEAM);
  assert.equal(resolved.workspaceScope, CONVERSATIONS_WORKSPACE_SCOPES.OVERSIGHT);
  assert.equal(resolved.unauthorizedTeam, false);
});

test("unauthorized user cannot access Team Prospects", () => {
  assert.equal(canSeeConversationsTeamProspects({ role: "agent" }), false);
  assert.equal(canSeeConversationsTeamProspects({ role: "recruiter" }), false);

  const resolved = resolveConversationsWorkspaceTab({
    workspaceScopeParam: "oversight",
    canSeeTeam: false
  });
  assert.equal(resolved.tab, CONVERSATIONS_WORKSPACE_TABS.MINE);
  assert.equal(resolved.workspaceScope, CONVERSATIONS_WORKSPACE_SCOPES.MINE);
  assert.equal(resolved.unauthorizedTeam, true);
});

test("Conversations page wires My / Team tabs and always sends resolved scope", () => {
  const page = fs.readFileSync(path.join(here, "../pages/ConversationsPage.jsx"), "utf8");
  assert.match(page, /conversationsMyProspects/);
  assert.match(page, /conversationsTeamProspects/);
  assert.match(page, /canSeeConversationsTeamProspects/);
  assert.match(page, /workspaceScope,/);
  assert.match(page, /unauthorizedTeam/);
});
