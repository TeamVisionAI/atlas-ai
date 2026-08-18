/**
 * Sprint 16.1 — Facebook Lead Ads intake for autonomous recruiting workflow.
 */

const { processFacebookLead } = require("./recruitingWorkflowOrchestrator");
const { locateOrCreateWhatsAppProspect } = require("./whatsappProspectResolver");
const { WHATSAPP_ENTRY_METHOD } = require("./whatsappConstants");

function parseLeadPayload(body = {}) {
  if (body.phone && (body.first_name || body.firstName || body.name)) {
    return {
      firstName: body.first_name || body.firstName || String(body.name || "").split(" ")[0],
      lastName: body.last_name || body.lastName || String(body.name || "").split(" ").slice(1).join(" "),
      phone: body.phone,
      email: body.email || null,
      language: body.language || "es",
      leadgenId: body.leadgen_id || body.leadgenId || null
    };
  }

  const change = body.entry?.[0]?.changes?.[0];
  const value = change?.value || {};

  if (change?.field !== "leadgen" || !value.leadgen_id) {
    return null;
  }

  return {
    firstName: value.first_name || value.firstName || "Facebook",
    lastName: value.last_name || value.lastName || "Lead",
    phone: value.phone_number || value.phone || null,
    email: value.email || null,
    language: value.language || "es",
    leadgenId: value.leadgen_id
  };
}

async function intakeFacebookLead(body = {}) {
  const parsed = parseLeadPayload(body);

  if (!parsed?.phone) {
    return {
      success: false,
      error: "PHONE_REQUIRED",
      message: "Facebook lead payload must include a phone number."
    };
  }

  await locateOrCreateWhatsAppProspect({
    phone: parsed.phone,
    name: [parsed.firstName, parsed.lastName].filter(Boolean).join(" "),
    firstMessage: "Facebook Lead Ads submission",
    correlationBase: parsed.leadgenId ? `facebook-lead:${parsed.leadgenId}` : "facebook-lead",
    intakeSource: WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS
  });

  const result = await processFacebookLead(parsed);

  return {
    ...result,
    intake: "facebook_lead"
  };
}

module.exports = {
  parseLeadPayload,
  intakeFacebookLead
};
