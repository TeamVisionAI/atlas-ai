/**
 * Sprint 12.0 — WhatsApp Cloud API connector (future — skeleton).
 * Existing WhatsApp pipeline (Sprint 11.4) remains in backend/core until migration.
 */

const { CommunicationConnector } = require("../../interfaces/CommunicationConnector");
const { CHANNEL } = require("../../models/Channel");

class WhatsAppConnector extends CommunicationConnector {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL.WHATSAPP });
  }
}

module.exports = {
  WhatsAppConnector
};
