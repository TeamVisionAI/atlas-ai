/**
 * BR-147 — Org Embedded Signup reconnect vs personal capability gate.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OWNERSHIP_ORGANIZATION,
  OWNERSHIP_PERSONAL,
  buildWhatsAppConnectHref,
  normalizeOwnershipMode,
  resolveEmbeddedSignupLaunchBlocker,
  resolveWhatsAppConnectAccess,
  resolveWhatsAppSignupOwnership,
  selectEmbeddedSignupConnectionState
} from "./whatsappEmbeddedSignupOwnership.js";
import { buildExchangePayload, createEmbeddedSignupAttempt } from "./embeddedSignupHandoff.js";

test("org query resolves organization ownership; default is personal", () => {
  assert.equal(resolveWhatsAppSignupOwnership("?ownership=organization"), OWNERSHIP_ORGANIZATION);
  assert.equal(resolveWhatsAppSignupOwnership("ownership=organization"), OWNERSHIP_ORGANIZATION);
  assert.equal(resolveWhatsAppSignupOwnership("?ownership=personal"), OWNERSHIP_PERSONAL);
  assert.equal(resolveWhatsAppSignupOwnership(""), OWNERSHIP_PERSONAL);
  assert.equal(resolveWhatsAppSignupOwnership(new URLSearchParams("ownership=organization")), OWNERSHIP_ORGANIZATION);
});

test("org mode bypasses personal capability gate and requires org:write", () => {
  const orgWithoutCapability = resolveWhatsAppConnectAccess({
    ownershipMode: OWNERSHIP_ORGANIZATION,
    userLoaded: true,
    personalWhatsAppEnabled: false,
    canWriteOrg: true
  });
  assert.equal(orgWithoutCapability.allowed, true);
  assert.equal(orgWithoutCapability.redirectToIntegrations, false);

  const orgWithoutWrite = resolveWhatsAppConnectAccess({
    ownershipMode: OWNERSHIP_ORGANIZATION,
    userLoaded: true,
    personalWhatsAppEnabled: true,
    canWriteOrg: false
  });
  assert.equal(orgWithoutWrite.allowed, false);
  assert.equal(orgWithoutWrite.redirectToIntegrations, true);
  assert.equal(orgWithoutWrite.reason, "ORG_WRITE_REQUIRED");
});

test("personal mode still requires personal capability", () => {
  const blocked = resolveWhatsAppConnectAccess({
    ownershipMode: OWNERSHIP_PERSONAL,
    userLoaded: true,
    personalWhatsAppEnabled: false,
    canWriteOrg: true
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.redirectToIntegrations, true);
  assert.equal(blocked.reason, "PERSONAL_WHATSAPP_DISABLED");

  const allowed = resolveWhatsAppConnectAccess({
    ownershipMode: OWNERSHIP_PERSONAL,
    userLoaded: true,
    personalWhatsAppEnabled: true,
    canWriteOrg: false
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.redirectToIntegrations, false);
});

test("org connection state is independent of personal connection state", () => {
  const payload = {
    connected: true,
    connection: { phoneNumberId: "personal-phone" },
    organizationChannel: {
      connected: false,
      connection: null
    }
  };

  const personal = selectEmbeddedSignupConnectionState(payload, OWNERSHIP_PERSONAL);
  assert.equal(personal.connected, true);
  assert.equal(personal.connection.phoneNumberId, "personal-phone");

  const orgDisconnected = selectEmbeddedSignupConnectionState(payload, OWNERSHIP_ORGANIZATION);
  assert.equal(orgDisconnected.connected, false);
  assert.equal(orgDisconnected.connection, null);

  const orgConnected = selectEmbeddedSignupConnectionState(
    {
      connected: false,
      connection: null,
      organizationChannel: {
        connected: true,
        connection: { phoneNumberId: "org-7338" }
      }
    },
    OWNERSHIP_ORGANIZATION
  );
  assert.equal(orgConnected.connected, true);
  assert.equal(orgConnected.connection.phoneNumberId, "org-7338");
});

test("org mode sends ownershipMode=organization on exchange payload", () => {
  let attempt = createEmbeddedSignupAttempt(1, { ownershipMode: OWNERSHIP_ORGANIZATION });
  attempt = {
    ...attempt,
    oauthCode: "auth-code",
    wabaId: "waba-org"
  };
  const payload = buildExchangePayload(
    attempt,
    "https://app.useatlas-ai.com/app/settings/whatsapp"
  );
  assert.equal(payload.ownershipMode, OWNERSHIP_ORGANIZATION);
  assert.equal(payload.code, "auth-code");
  assert.equal(payload.wabaId, "waba-org");
});

test("personal exchange payload stays personal", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = {
    ...attempt,
    oauthCode: "auth-code",
    wabaId: "waba-personal"
  };
  const payload = buildExchangePayload(
    attempt,
    "https://app.useatlas-ai.com/app/settings/whatsapp"
  );
  assert.equal(payload.ownershipMode, OWNERSHIP_PERSONAL);
});

test("missing FB SDK/config produces a visible launch blocker", () => {
  assert.equal(
    resolveEmbeddedSignupLaunchBlocker({
      ready: false,
      appId: null,
      configId: "cfg",
      hasFacebookSdk: false
    }),
    "missing_config"
  );
  assert.equal(
    resolveEmbeddedSignupLaunchBlocker({
      ready: false,
      appId: "app",
      configId: "cfg",
      hasFacebookSdk: false,
      sdkError: "sdk_load_failed"
    }),
    "sdk_load_failed"
  );
  assert.equal(
    resolveEmbeddedSignupLaunchBlocker({
      ready: false,
      appId: "app",
      configId: "cfg",
      hasFacebookSdk: false
    }),
    "sdk_not_ready"
  );
  assert.equal(
    resolveEmbeddedSignupLaunchBlocker({
      ready: true,
      appId: "app",
      configId: "cfg",
      hasFacebookSdk: true
    }),
    null
  );
});

test("org card href includes ownership=organization; personal does not", () => {
  assert.equal(
    buildWhatsAppConnectHref("/app/settings/whatsapp", OWNERSHIP_ORGANIZATION),
    "/app/settings/whatsapp?ownership=organization"
  );
  assert.equal(
    buildWhatsAppConnectHref("/app/settings/whatsapp", OWNERSHIP_PERSONAL),
    "/app/settings/whatsapp"
  );
  assert.equal(normalizeOwnershipMode("organization"), OWNERSHIP_ORGANIZATION);
  assert.equal(normalizeOwnershipMode("personal"), OWNERSHIP_PERSONAL);
});

test("org Integrations card and WhatsAppConnect wire organization ownership", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const card = fs.readFileSync(
    path.join(root, "components/settings/WhatsAppIntegrationCard.jsx"),
    "utf8"
  );
  const orgPage = fs.readFileSync(
    path.join(root, "components/settings/OrganizationIntegrations.jsx"),
    "utf8"
  );
  const connect = fs.readFileSync(path.join(root, "pages/WhatsAppConnect.jsx"), "utf8");

  assert.match(orgPage, /ownershipMode="organization"/);
  assert.match(card, /reconnectTo/);
  assert.match(connect, /resolveWhatsAppSignupOwnership/);
  assert.match(connect, /ownershipMode/);
  assert.doesNotMatch(
    connect,
    /if \(user && !personalWhatsAppEnabled\) \{\s*navigate\(appPath\("settings\/integrations"\)/
  );
});
