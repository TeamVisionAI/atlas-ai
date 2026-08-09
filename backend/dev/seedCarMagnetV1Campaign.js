/**
 * Seed Car Magnet V1 campaign (Phase 1).
 *
 * Controlled single campaign:
 *   car_recruiting_01 / car_magnet / interview
 *   Team Vision org + primary RVP only
 *
 * Usage:
 *   node backend/dev/seedCarMagnetV1Campaign.js
 *
 * Prints the opaque public token ONCE when created.
 * Token plaintext is never stored — only SHA-256 hash.
 *
 * Does not enable Recruit AI execution. Does not send WhatsApp.
 */

require("dotenv").config();

const {
  createQrCampaignService
} = require("../core/qrChannel/qrCampaignService");
const {
  createSupabaseQrChannelRepository
} = require("../core/qrChannel/supabaseQrChannelRepository");
const { CAR_MAGNET_V1 } = require("../core/qrChannel/constants");
const { resolveAllowlistedWhatsAppE164 } = require("../core/qrChannel/whatsappRedirect");

async function main() {
  const repo = createSupabaseQrChannelRepository();
  const service = createQrCampaignService({ repository: repo });

  const destination = resolveAllowlistedWhatsAppE164({
    env: process.env
  });
  if (!destination.ok) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          reasonCode: destination.reasonCode,
          message:
            "Set QR_CHANNEL_WHATSAPP_E164 to an allowlisted digits-only WhatsApp number before seeding. No silent production fallback is used."
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const whatsappE164 = destination.e164;

  const result = await service.seedCampaign({
    orgId: CAR_MAGNET_V1.orgId,
    ownerUserId: CAR_MAGNET_V1.ownerUserId,
    campaignKey: CAR_MAGNET_V1.campaignKey,
    name: CAR_MAGNET_V1.name,
    source: CAR_MAGNET_V1.source,
    campaignType: CAR_MAGNET_V1.campaignType,
    defaultConversationGoal: CAR_MAGNET_V1.defaultConversationGoal,
    whatsappE164
  });

  if (!result.ok) {
    console.error("Seed failed:", result);
    process.exit(1);
  }

  if (!result.created) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          created: false,
          campaignId: result.campaign.id,
          campaignKey: result.campaign.campaign_key,
          orgId: result.campaign.org_id,
          ownerUserId: result.campaign.owner_user_id,
          status: result.campaign.status,
          tokenPrefix: result.campaign.public_token_prefix || null,
          message: result.message
        },
        null,
        2
      )
    );
    console.log(
      "\nNote: existing campaign — public token cannot be recovered from hash. Create a new campaign_key or rotate token via a controlled procedure if needed."
    );
    return;
  }

  const publicPath = `/go/${result.publicToken}`;
  console.log(
    JSON.stringify(
      {
        ok: true,
        created: true,
        campaignId: result.campaign.id,
        campaignKey: result.campaign.campaign_key,
        orgId: result.campaign.org_id,
        ownerUserId: result.campaign.owner_user_id,
        source: result.campaign.source,
        defaultConversationGoal: result.campaign.default_conversation_goal,
        status: result.campaign.status,
        whatsappE164,
        publicPath,
        message: result.message
      },
      null,
      2
    )
  );
  console.log("\nSTORE THIS TOKEN SECURELY (shown once):");
  console.log(result.publicToken);
  console.log(`\nTest URL path: ${publicPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
