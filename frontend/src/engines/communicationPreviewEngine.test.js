import test from "node:test";
import assert from "node:assert/strict";
import {
  extractOutboundPayload,
  hasRequiredValidationErrors,
  partitionValidationItems,
  previewMessageMatchesSendPayload
} from "./communicationPreviewEngine.js";

test("previewMessageMatchesSendPayload requires identical outbound message fields", () => {
  const preview = {
    message: "Hello Maria,\n\nYour interview is confirmed!",
    template: "interview_details",
    language: "en",
    phone: "+15555550100"
  };

  const send = {
    message: "Hello Maria,\n\nYour interview is confirmed!",
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

test("partitionValidationItems separates required and recommended content", () => {
  const missingContent = [
    { key: "zoomLink", severity: "error", category: "required" },
    { key: "profilePhoto", severity: "recommended", category: "recommended" }
  ];

  const { required, recommended } = partitionValidationItems(missingContent);

  assert.equal(required.length, 1);
  assert.equal(required[0].key, "zoomLink");
  assert.equal(recommended.length, 1);
  assert.equal(recommended[0].key, "profilePhoto");
});

test("hasRequiredValidationErrors returns true only for blocking items", () => {
  assert.equal(
    hasRequiredValidationErrors([{ key: "profilePhoto", severity: "recommended" }]),
    false
  );
  assert.equal(
    hasRequiredValidationErrors([{ key: "zoomLink", severity: "error" }]),
    true
  );
});
