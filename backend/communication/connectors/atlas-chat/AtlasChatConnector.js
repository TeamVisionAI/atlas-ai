/**
 * Sprint 12.0 — Atlas Chat connector (future — skeleton).
 */

const { CommunicationConnector } = require("../../interfaces/CommunicationConnector");
const { CHANNEL } = require("../../models/Channel");

class AtlasChatConnector extends CommunicationConnector {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL.ATLAS_CHAT });
  }
}

module.exports = {
  AtlasChatConnector
};
