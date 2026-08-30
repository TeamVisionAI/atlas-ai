import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  resolveAgentNotificationPath,
  resolveConversationListRow
} from "./agentNotificationPath.js";

test("appointment events deep-link to the appointment query, not the generic calendar", () => {
  const path = resolveAgentNotificationPath({
    eventType: "NEW_APPOINTMENT",
    entityType: "appointment",
    entityId: "f20dd5ad-a371-42f7-ad94-a87767585568",
    actionUrl: "/app/appointments"
  });
  assert.equal(
    path,
    "/app/appointments?appointmentId=f20dd5ad-a371-42f7-ad94-a87767585568"
  );
  assert.notEqual(path, "/app/appointments");
});

test("needs attention and takeover deep-link to the conversation prospect", () => {
  assert.equal(
    resolveAgentNotificationPath({
      eventType: "NEEDS_ATTENTION",
      entityType: "prospect",
      entityId: "29853100-f151-4ca8-b07d-624fd20c6685",
      actionUrl: "/app/conversations"
    }),
    "/app/conversations?prospectId=29853100-f151-4ca8-b07d-624fd20c6685"
  );
  assert.equal(
    resolveAgentNotificationPath({
      eventType: "HUMAN_TAKEOVER_REQUESTED",
      entityId: "aaa-prospect"
    }),
    "/app/conversations?prospectId=aaa-prospect"
  );
});

test("missing entity falls back to stored action url", () => {
  assert.equal(
    resolveAgentNotificationPath({
      eventType: "NEW_APPOINTMENT",
      actionUrl: "/app/appointments"
    }),
    "/app/appointments"
  );
});

test("bell and destination pages use the resolver and a body portal", () => {
  const bell = fs.readFileSync(
    path.join(__dirname, "../components/layout/NotificationBell.jsx"),
    "utf8"
  );
  const css = fs.readFileSync(
    path.join(__dirname, "../components/layout/NotificationBell.css"),
    "utf8"
  );
  const appointments = fs.readFileSync(
    path.join(__dirname, "../pages/AppointmentsPage.jsx"),
    "utf8"
  );
  const conversations = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.jsx"),
    "utf8"
  );
  assert.match(bell, /createPortal/);
  assert.match(bell, /resolveAgentNotificationPath/);
  assert.match(bell, /resolveNotificationPanelPlacement/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /z-index:\s*400/);
  assert.match(appointments, /searchParams\.get\("appointmentId"\)/);
  assert.match(appointments, /fetchAppointment\(focusAppointmentId\)/);
  assert.match(conversations, /resolveConversationListRow/);
  assert.match(conversations, /searchParams\.get\("prospectId"\)/);
});

test("conversation list resolver prefers phone then prospect id", () => {
  const items = [
    { id: "p-1", phone: "+15551111111" },
    { id: "p-2", phone: "+15552222222" }
  ];
  assert.equal(
    resolveConversationListRow({ items, prospectId: "p-2" })?.phone,
    "+15552222222"
  );
  assert.equal(
    resolveConversationListRow({ items, phone: "+15551111111", prospectId: "p-2" })?.id,
    "p-1"
  );
  assert.equal(resolveConversationListRow({ items, prospectId: "missing" }), null);
});
