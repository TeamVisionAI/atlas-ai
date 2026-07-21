/**
 * Sprint 12.0 — Instagram Direct Messages connector (skeleton).
 */

const { CommunicationConnector } = require("../../interfaces/CommunicationConnector");
const { CHANNEL } = require("../../models/Channel");

class InstagramConnector extends CommunicationConnector {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL.INSTAGRAM });
  }
}

module.exports = {
  InstagramConnector
};
