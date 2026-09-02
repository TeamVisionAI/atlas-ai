/**
 * BR-218 — Conversations are mine-only; Support Mode is explicit and read-only.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONVERSATIONS_WORKSPACE_SCOPES,
  CONVERSATIONS_WORKSPACE_TABS,
  canOpenConversationsSupportView,
  canSeeConversationsTeamProspects,
  conversationsSupportMutationsAllowed,
  resolveConversationsSupportView,
  resolveConversationsWorkspaceTab
} from "./conversationsWorkspaceScope.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Team Prospects is removed for every role", () => {
  assert.equal(canSeeConversationsTeamProspects({ role: "rvp" }), false);
  assert.equal(canSeeConversationsTeamProspects({ role: "administrator" }), false);
  assert.equal(canSeeConversationsTeamProspects({ role: "division_leader" }), false);
  assert.equal(canSeeConversationsTeamProspects({ role: "agent" }), false);
});

test("oversight query is coerced to My Conversations", () => {
  const resolved = resolveConversationsWorkspaceTab({
    workspaceScopeParam: "oversight"
  });
  assert.equal(resolved.tab, CONVERSATIONS_WORKSPACE_TABS.MINE);
  assert.equal(resolved.workspaceScope, CONVERSATIONS_WORKSPACE_SCOPES.MINE);
  assert.equal(resolved.unauthorizedTeam, true);
});

test("Support view requires active Support Mode, not a query flag", () => {
  assert.equal(
    canOpenConversationsSupportView({
      canUseConversationsSupport: true,
      supportModeActive: false
    }),
    false
  );
  assert.equal(
    canOpenConversationsSupportView({
      canUseConversationsSupport: true,
      supportModeActive: true
    }),
    true
  );
  const inactive = resolveConversationsSupportView({
    supportUserId: "agent-1",
    canOpenSupport: false
  });
  assert.equal(inactive.active, false);
  const active = resolveConversationsSupportView({
    supportUserId: "agent-1",
    canOpenSupport: true,
    currentUserId: "admin-1"
  });
  assert.equal(active.active, true);
  assert.equal(active.readOnly, true);
  assert.equal(conversationsSupportMutationsAllowed(active), false);
});

test("Conversations page no longer wires Team Prospects tabs", () => {
  const page = fs.readFileSync(path.join(here, "../pages/ConversationsPage.jsx"), "utf8");
  assert.doesNotMatch(page, /conversationsTeamProspects/);
  assert.doesNotMatch(page, /canSeeConversationsTeamProspects/);
  assert.doesNotMatch(page, /CONVERSATIONS_WORKSPACE_TABS\.TEAM/);
  assert.match(page, /supportUserId/);
  assert.match(page, /READ-ONLY SUPPORT MODE|conversationsSupportReadOnlyLabel/);
});

test("I) My Conversations cache cannot leak between users in the same org", () => {
  const service = fs.readFileSync(
    path.join(here, "../services/conversationsCenterService.js"),
    "utf8"
  );
  const page = fs.readFileSync(path.join(here, "../pages/ConversationsPage.jsx"), "utf8");
  assert.match(service, /userId \|\| "anon"/);
  assert.match(service, /supportUserId/);
  assert.match(page, /userId: listUserId/);
  assert.match(page, /listUserId/);
  assert.doesNotMatch(
    service,
    /return `\$\{organizationId \|\| "none"\}::\$\{filter\}::\$\{search\}::\$\{view\}::\$\{workspaceScope \|\| "mine"\}`/
  );
});
