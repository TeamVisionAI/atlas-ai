/**
 * Sprint 12.0 — Email connector (future — skeleton).
 */

const { CommunicationConnector } = require("../../interfaces/CommunicationConnector");
const { CHANNEL } = require("../../models/Channel");

class EmailConnector extends CommunicationConnector {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL.EMAIL });
  }
}

module.exports = {
  EmailConnector
};
