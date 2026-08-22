/**
 * Seed Team Vision recruiting canary campaign intake code (BR-147).
 * Usage: node backend/dev/seedTeamVisionCampaignIntakeCanary.js
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const { randomUUID } = require("crypto");
const { Client } = require("pg");
const {
  buildIntakeCode,
  buildPrefilledMessage
} = require("../core/campaignIntakeCode/intakeCodeGenerator");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const CAMPAIGN_NAME = "TV-RECRUIT-MIAMI-SP-0826";
const CANARY_CODE = "TVR-0826-A7K4";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const migration = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../database/migrations/049_campaign_intake_codes.sql"
    ),
    "utf8"
  );
  await client.query(migration);

  const phoneRow = await client.query(
    `SELECT phone_number_id, display_phone_number
     FROM whatsapp_integrations
     WHERE organization_id = $1 AND status = 'connected'
     LIMIT 1`,
    [TEAM_VISION_ORG]
  );
  const phoneNumberId = phoneRow.rows[0]?.phone_number_id;
  if (!phoneNumberId) {
    throw new Error("Team Vision WhatsApp integration not connected");
  }

  const existing = await client.query(
    `SELECT id, code, campaign_name, status
     FROM campaign_intake_codes
     WHERE organization_id = $1 AND code = $2
     LIMIT 1`,
    [TEAM_VISION_ORG, CANARY_CODE]
  );

  let code = CANARY_CODE;
  if (!existing.rows.length) {
    code = CANARY_CODE;
    await client.query(
      `INSERT INTO campaign_intake_codes (
        id, organization_id, owner_user_id, whatsapp_phone_number_id,
        code, campaign_name, purpose, language, status, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        randomUUID(),
        TEAM_VISION_ORG,
        null,
        phoneNumberId,
        code,
        CAMPAIGN_NAME,
        "RECRUITING",
        "es",
        "ACTIVE",
        JSON.stringify({ canary: true, seededAt: new Date().toISOString() })
      ]
    );
  } else {
    code = existing.rows[0].code;
  }

  const prefilledMessage = buildPrefilledMessage(code, "es");
  console.log(
    JSON.stringify(
      {
        organizationId: TEAM_VISION_ORG,
        campaignName: CAMPAIGN_NAME,
        whatsappPhoneNumberId: phoneNumberId,
        displayPhoneNumber: phoneRow.rows[0]?.display_phone_number || null,
        code,
        prefilledMessage,
        status: "ACTIVE"
      },
      null,
      2
    )
  );

  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
