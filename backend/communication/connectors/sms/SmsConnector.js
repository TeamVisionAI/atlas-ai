/**
 * Sprint 12.0 — SMS connector (future — skeleton).
 */

const { CommunicationConnector } = require("../../interfaces/CommunicationConnector");
const { CHANNEL } = require("../../models/Channel");

class SmsConnector extends CommunicationConnector {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL.SMS });
  }
}

module.exports = {
  SmsConnector
};
