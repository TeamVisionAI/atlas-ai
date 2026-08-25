import test from "node:test";
import assert from "node:assert/strict";
import { resolveWhatsAppErrorKey, WHATSAPP_ERROR_KEYS } from "./mapWhatsAppUserError.js";

test("partial handoff maps to dedicated copy key", () => {
  assert.equal(
    resolveWhatsAppErrorKey({ errorKey: "PARTIAL_HANDOFF" }),
    WHATSAPP_ERROR_KEYS.PARTIAL_HANDOFF
  );
});

test("status verify failure maps to dedicated copy key", () => {
  assert.equal(
    resolveWhatsAppErrorKey({ errorKey: "STATUS_VERIFY_FAILED" }),
    WHATSAPP_ERROR_KEYS.STATUS_VERIFY_FAILED
  );
});
