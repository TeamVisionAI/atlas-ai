"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveWhatsAppInboundOrganizationId,
  WhatsAppInboundOrganizationError
} = require("../core/whatsappInboundOrganizationResolver");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const OWNER_A = "d8d75c0e-d93e-42c9-950e-004fbfabdc8d";
const PHONE_ID = "336196332914297";

function repo(connection) {
  return {
    async findConnectionByPhoneNumberId(id) {
      return String(id) === PHONE_ID ? connection : null;
    },
    async getConnection() {
      return null;
    }
  };
}

test("BR-165A explicit tenant scope preserves exact personal WhatsApp owner", async () => {
  const result = await resolveWhatsAppInboundOrganizationId({
    phoneNumberId: PHONE_ID,
    explicitOrganizationId: ORG_A,
    connectionRepository: repo({
      organization_id: ORG_A,
      user_id: OWNER_A,
      phone_number_id: PHONE_ID,
      waba_id: "waba-a",
      status: "connected"
    })
  });

  assert.equal(result.organizationId, ORG_A);
  assert.equal(result.ownerUserId, OWNER_A);
  assert.equal(result.source, "whatsapp_personal_connection");
  assert.equal(result.connection.phone_number_id, PHONE_ID);
  assert.equal(result.connection.organization_id, ORG_A);
  assert.equal(result.connection.user_id, OWNER_A);
  assert.equal(result.connection.status, "connected");
});

test("BR-165A personal WhatsApp asset cannot cross tenant boundary", async () => {
  await assert.rejects(
    () =>
      resolveWhatsAppInboundOrganizationId({
        phoneNumberId: PHONE_ID,
        explicitOrganizationId: ORG_B,
        connectionRepository: repo({
          organization_id: ORG_A,
          user_id: OWNER_A,
          phone_number_id: PHONE_ID,
          waba_id: "waba-a",
          status: "connected"
        })
      }),
    (error) => {
      assert.equal(error instanceof WhatsAppInboundOrganizationError, true);
      assert.equal(error.code, "WHATSAPP_TENANT_ASSET_MISMATCH");
      return true;
    }
  );
});

test("organization-owned WhatsApp asset resolves tenant without inventing an agent owner", async () => {
  const result = await resolveWhatsAppInboundOrganizationId({
    phoneNumberId: PHONE_ID,
    explicitOrganizationId: ORG_A,
    connectionRepository: repo({
      organization_id: ORG_A,
      user_id: null,
      phone_number_id: PHONE_ID,
      waba_id: "waba-a",
      status: "connected"
    })
  });

  assert.equal(result.organizationId, ORG_A);
  assert.equal(result.ownerUserId, null);
  assert.equal(result.source, "whatsapp_organization_connection");
  assert.equal(result.connection.phone_number_id, PHONE_ID);
  assert.equal(result.connection.organization_id, ORG_A);
  assert.equal(result.connection.user_id, null);
  assert.equal(result.connection.status, "connected");
});
