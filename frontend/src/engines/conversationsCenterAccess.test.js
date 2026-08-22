/**
 * Conversations Center access helper unit tests.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATIONS_ACCESS_STATE,
  conversationsAccessAllowsNav,
  resolveConversationsAccessStateFromError,
  resolveConversationsAccessStateFromPayload
} from "../engines/conversationsCenterAccess.js";

test("access payload maps allowed / not enabled / forbidden", () => {
  assert.equal(
    resolveConversationsAccessStateFromPayload({ allowed: true }),
    CONVERSATIONS_ACCESS_STATE.ALLOWED
  );
  assert.equal(
    resolveConversationsAccessStateFromPayload({
      allowed: false,
      code: "CONVERSATIONS_CENTER_NOT_ENABLED"
    }),
    CONVERSATIONS_ACCESS_STATE.NOT_ENABLED
  );
  assert.equal(
    resolveConversationsAccessStateFromPayload({
      allowed: false,
      code: "CONVERSATIONS_CENTER_FORBIDDEN"
    }),
    CONVERSATIONS_ACCESS_STATE.FORBIDDEN
  );
  assert.equal(
    conversationsAccessAllowsNav(CONVERSATIONS_ACCESS_STATE.ALLOWED),
    true
  );
  assert.equal(
    conversationsAccessAllowsNav(CONVERSATIONS_ACCESS_STATE.NOT_ENABLED),
    false
  );
});

test("403 errors map without Niovel-specific codes as primary", () => {
  assert.equal(
    resolveConversationsAccessStateFromError({
      status: 403,
      code: "CONVERSATIONS_CENTER_NOT_ENABLED"
    }),
    CONVERSATIONS_ACCESS_STATE.NOT_ENABLED
  );
  assert.equal(
    resolveConversationsAccessStateFromError({
      status: 403,
      code: "CONVERSATIONS_CENTER_USER_FORBIDDEN"
    }),
    CONVERSATIONS_ACCESS_STATE.FORBIDDEN
  );
});
