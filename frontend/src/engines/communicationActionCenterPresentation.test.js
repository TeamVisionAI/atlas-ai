import test from "node:test";
import assert from "node:assert/strict";
import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";
import {
  COMMUNICATION_ACTION_CENTER_CHROME,
  COMMUNICATION_ACTION_CENTER_ORDER,
  buildCommunicationActionCenterCards
} from "./communicationActionCenterPresentation.js";

const translate = (key) => key;

test("buildCommunicationActionCenterCards preserves action center order", () => {
  const cards = buildCommunicationActionCenterCards({
    phone: "+15555550100",
    translate,
    includeAddNote: true,
    actions: COMMUNICATION_ACTION_CENTER_ORDER.filter(
      (id) =>
        id !== COMMUNICATION_ACTION_CENTER_CHROME.CALL &&
        id !== COMMUNICATION_ACTION_CENTER_CHROME.ADD_NOTE
    ).map((id) => ({
      id,
      icon: "•",
      title: id,
      subtitle: "hint",
      enabled: true,
      variant: "default"
    }))
  });

  assert.deepEqual(
    cards.map((card) => card.id),
    COMMUNICATION_ACTION_CENTER_ORDER
  );
});

test("buildCommunicationActionCenterCards marks a recommended action without reordering", () => {
  const cards = buildCommunicationActionCenterCards({
    phone: "+15555550100",
    translate,
    includeAddNote: true,
    recommendedActionId: COMMUNICATION_ACTION_IDS.CUSTOM,
    actions: [
      {
        id: COMMUNICATION_ACTION_IDS.CUSTOM,
        icon: "💬",
        title: "Custom WhatsApp Message",
        subtitle: "hint",
        enabled: true,
        variant: "default"
      }
    ]
  });

  const whatsapp = cards.find((card) => card.id === COMMUNICATION_ACTION_IDS.CUSTOM);
  const call = cards.find((card) => card.id === COMMUNICATION_ACTION_CENTER_CHROME.CALL);

  assert.equal(whatsapp.recommended, true);
  assert.equal(call.recommended, false);
  assert.equal(cards[0].id, COMMUNICATION_ACTION_CENTER_CHROME.CALL);
});

test("buildCommunicationActionCenterCards keeps disabled action subtitles from availability rules", () => {
  const cards = buildCommunicationActionCenterCards({
    phone: "+15555550100",
    translate,
    actions: [
      {
        id: COMMUNICATION_ACTION_IDS.SEND_ZOOM,
        icon: "🎥",
        title: "Send Zoom Invitation",
        subtitle: "whatsappActionDisabledZoomNotCreated",
        enabled: false,
        variant: "primary"
      }
    ]
  });

  const zoom = cards.find((card) => card.id === COMMUNICATION_ACTION_IDS.SEND_ZOOM);

  assert.equal(zoom.subtitle, "whatsappActionDisabledZoomNotCreated");
  assert.equal(zoom.enabled, false);
});
