/**
 * Journey #6 — Future channel placeholders (not yet operational).
 */

const { ChannelAdapter } = require("../ChannelAdapter");

function createPlaceholderAdapter(channelId) {
  return class PlaceholderAdapter extends ChannelAdapter {
    constructor(config = {}) {
      super({ ...config, channelId });
    }

    receive() {
      throw new Error(`${channelId} adapter is not yet operational`);
    }

    normalize() {
      throw new Error(`${channelId} adapter is not yet operational`);
    }

    async send() {
      throw new Error(`${channelId} adapter is not yet operational`);
    }

    async health() {
      return { channel: channelId, status: "placeholder" };
    }
  };
}

const SMSAdapter = createPlaceholderAdapter("sms");
const VoiceAdapter = createPlaceholderAdapter("voice");
const EmailAdapter = createPlaceholderAdapter("email");
const TeamsAdapter = createPlaceholderAdapter("teams");
const SlackAdapter = createPlaceholderAdapter("slack");

module.exports = {
  SMSAdapter,
  VoiceAdapter,
  EmailAdapter,
  TeamsAdapter,
  SlackAdapter,
  createPlaceholderAdapter
};
