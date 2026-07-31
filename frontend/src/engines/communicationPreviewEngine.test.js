import test from "node:test";
import assert from "node:assert/strict";
import {
  extractOutboundPayload,
  previewMessageMatchesSendPayload
} from "./communicationPreviewEngine.js";

test("previewMessageMatchesSendPayload requires identical outbound message fields", () => {
  const preview = {
    message: "Hi Maria,\n\nHere are your interview details:",
    template: "interview_details",
    language: "en",
    phone: "+15555550100"
  };

  const send = {
    message: "Hi Maria,\n\nHere are your interview details:",
    template: "interview_details",
    language: "en",
    phone: "+15555550100"
  };

  assert.equal(previewMessageMatchesSendPayload(preview, send), true);
  assert.equal(
    previewMessageMatchesSendPayload(preview, { ...send, message: "Different" }),
    false
  );
});

test("extractOutboundPayload reads nested outbound payload from API result", () => {
  const payload = extractOutboundPayload({
    success: true,
    outboundPayload: {
      message: "Final message",
      template: "interview_details"
    }
  });

  assert.equal(payload.message, "Final message");
  assert.equal(payload.template, "interview_details");
});
