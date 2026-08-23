/**
 * Automated WhatsApp reply delivery semantics — Graph accept vs Meta lifecycle.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  conversationDeliveredReply,
  prospectHasDeliveredAutomatedOutbound,
  prospectHasFailedAutomatedOutboundOnly,
  setOutboundDeliveriesQueryForTests
} = require("../core/whatsappAutomatedReplyDelivery");

test("conversationDeliveredReply fails closed on meta_delivery_status failed", () => {
  assert.equal(
    conversationDeliveredReply({
      success: true,
      replied: true,
      delivery: { success: true, metaDeliveryStatus: "failed" }
    }),
    false
  );
  assert.equal(
    conversationDeliveredReply({
      success: true,
      replied: true,
      delivery: { success: true, meta_delivery_status: "failed" }
    }),
    false
  );
  assert.equal(
    conversationDeliveredReply({
      success: true,
      replied: true,
      delivery: { success: true, metaDeliveryStatus: "delivered" }
    }),
    true
  );
});

test("failed automated outbound only does not block recovery retry", async () => {
  const phone = "+584144163784";
  const orgId = "00000000-0000-4000-8000-000000000001";

  setOutboundDeliveriesQueryForTests(async () => [
    {
      id: "1",
      status: "sent_freeform",
      intent: "CONVERSATION_ENGINE_REPLY",
      meta_delivery_status: "failed",
      provider_message_id: "wamid.failed",
      created_at: new Date().toISOString()
    }
  ]);

  try {
    assert.equal(await prospectHasDeliveredAutomatedOutbound(phone, orgId), false);
    assert.equal(await prospectHasFailedAutomatedOutboundOnly(phone, orgId), true);
  } finally {
    setOutboundDeliveriesQueryForTests(null);
  }
});
