/**
 * WhatsApp communication controller — HTTP adapter for copy+open workflow.
 */

const {
  previewWhatsAppCommunication,
  recordWhatsAppCopyOpen
} = require("../application/whatsappCommunicationApplicationService");
const { getTenantOrganizationId } = require("../services/tenantContextService");

function tenantOptions(req) {
  return {
    organizationId: getTenantOrganizationId(req),
    tenantScoped: true,
    actorUser: req.atlasUser || null
  };
}

async function getCommunicationPreview(req, res) {
  try {
    const result = await previewWhatsAppCommunication(
      req.params.phone,
      {
        template: req.query.template || null,
        sourceAction: req.query.sourceAction || null
      },
      tenantOptions(req)
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: error.message
    });
  }
}

async function postCommunicationSend(req, res) {
  try {
    const body = req.body || {};
    const deliveryMode = body.deliveryMode || "copy_open";

    if (deliveryMode === "automatic") {
      return res.status(501).json({
        success: false,
        error: "NOT_IMPLEMENTED",
        message: "Automatic WhatsApp Cloud API delivery is not enabled yet."
      });
    }

    const result = await recordWhatsAppCopyOpen(
      req.params.phone,
      {
        template: body.template || null,
        sourceAction: body.sourceAction || null
      },
      tenantOptions(req)
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: error.message
    });
  }
}

module.exports = {
  getCommunicationPreview,
  postCommunicationSend
};
