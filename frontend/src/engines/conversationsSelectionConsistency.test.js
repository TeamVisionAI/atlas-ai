import test from "node:test";
import assert from "node:assert/strict";
import {
  isConversationDetailCurrent,
  resolveSelectedTranscriptProspectId,
  shouldCommitConversationDetail,
  shouldCommitTimelinePayload,
  resolveWinningSelection
} from "./conversationsSelectionConsistency.js";

const SANTANDER = {
  phone: "+17865550001",
  id: "prospect-santander",
  name: "Santander_Sweets"
};
const WAJAIRO = {
  phone: "+17865550002",
  id: "prospect-wajairo",
  name: "Wajairo"
};
const CARLOS = {
  phone: "+17865550003",
  id: "prospect-carlos",
  name: "Carlos"
};

test("selecting second prospect resolves transcript id from list row immediately", () => {
  const id = resolveSelectedTranscriptProspectId({
    selectedPhone: WAJAIRO.phone,
    selectedItem: WAJAIRO,
    detail: {
      phone: SANTANDER.phone,
      prospectId: SANTANDER.id,
      conversation: SANTANDER
    }
  });
  assert.equal(id, WAJAIRO.id);
});

test("previous detail does not match new selection (forces clear/loading path)", () => {
  assert.equal(
    isConversationDetailCurrent(
      { phone: SANTANDER.phone, prospectId: SANTANDER.id },
      WAJAIRO.phone
    ),
    false
  );
});

test("stale async detail cannot overwrite current selection", () => {
  assert.equal(
    shouldCommitConversationDetail({
      requestPhone: SANTANDER.phone,
      selectedPhone: WAJAIRO.phone
    }),
    false
  );
  assert.equal(
    shouldCommitConversationDetail({
      requestPhone: WAJAIRO.phone,
      selectedPhone: WAJAIRO.phone
    }),
    true
  );
});

test("stale timeline payload cannot overwrite current prospect", () => {
  assert.equal(
    shouldCommitTimelinePayload({
      requestedProspectId: WAJAIRO.id,
      payload: { prospect: { id: SANTANDER.id }, items: [{ id: "old" }] }
    }),
    false
  );
  assert.equal(
    shouldCommitTimelinePayload({
      requestedProspectId: WAJAIRO.id,
      payload: { prospect: { id: WAJAIRO.id }, items: [{ id: "new" }] }
    }),
    true
  );
  assert.equal(
    shouldCommitTimelinePayload({
      requestedProspectId: WAJAIRO.id,
      payload: { items: [{ id: "orphan" }] }
    }),
    false
  );
});

test("rapid A/B/C selection resolves to C only", () => {
  const result = resolveWinningSelection([
    { type: "select", phone: SANTANDER.phone, prospectId: SANTANDER.id },
    { type: "select", phone: WAJAIRO.phone, prospectId: WAJAIRO.id },
    { type: "select", phone: CARLOS.phone, prospectId: CARLOS.id },
    {
      type: "detail",
      phone: SANTANDER.phone,
      detail: { phone: SANTANDER.phone, prospectId: SANTANDER.id }
    },
    {
      type: "timeline",
      requestedProspectId: SANTANDER.id,
      payload: { prospect: { id: SANTANDER.id }, items: [{ id: "a" }] }
    },
    {
      type: "detail",
      phone: WAJAIRO.phone,
      detail: { phone: WAJAIRO.phone, prospectId: WAJAIRO.id }
    },
    {
      type: "timeline",
      requestedProspectId: WAJAIRO.id,
      payload: { prospect: { id: WAJAIRO.id }, items: [{ id: "b" }] }
    },
    {
      type: "detail",
      phone: CARLOS.phone,
      detail: { phone: CARLOS.phone, prospectId: CARLOS.id }
    },
    {
      type: "timeline",
      requestedProspectId: CARLOS.id,
      payload: { prospect: { id: CARLOS.id }, items: [{ id: "c" }] }
    }
  ]);

  assert.equal(result.selectedPhone, CARLOS.phone);
  assert.equal(result.timelineProspectId, CARLOS.id);
  assert.equal(result.detail?.prospectId, CARLOS.id);
  assert.equal(result.detail?.phone, CARLOS.phone);
});

test("header/phone/transcript identity stay aligned for selected prospect", () => {
  const selectedPhone = WAJAIRO.phone;
  const selectedItem = WAJAIRO;
  const detail = {
    phone: WAJAIRO.phone,
    prospectId: WAJAIRO.id,
    conversation: WAJAIRO,
    ownershipState: "HUMAN"
  };

  assert.equal(isConversationDetailCurrent(detail, selectedPhone), true);
  assert.equal(
    resolveSelectedTranscriptProspectId({
      selectedPhone,
      selectedItem,
      detail
    }),
    WAJAIRO.id
  );
  assert.equal(selectedItem.phone, detail.phone);
  assert.equal(selectedItem.id, detail.prospectId);
});

test("ConversationsPage wires selection remount key + detail match guard", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    new URL("../pages/ConversationsPage.jsx", import.meta.url),
    "utf8"
  );
  assert.match(src, /resolveSelectedTranscriptProspectId/);
  assert.match(src, /isConversationDetailCurrent/);
  assert.match(src, /shouldCommitConversationDetail/);
  assert.match(src, /key=\{`cc-timeline:\$\{timelineProspectId\}`\}/);
  assert.match(src, /setDetail\(null\)/);
});

test("CommunicationsCenterTimeline clears payload and gates stale responses", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    new URL(
      "../features/prospect-workspace/components/CommunicationsCenterTimeline.jsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(src, /setPayload\(null\)/);
  assert.match(src, /shouldCommitTimelinePayload/);
  assert.match(src, /status === "loading"/);
});
