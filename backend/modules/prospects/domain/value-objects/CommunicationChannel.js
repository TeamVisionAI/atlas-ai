/**
 * Sprint 14.1 — Communication channel value object.
 */

const { CHANNEL_TYPES } = require("../constants");
const { ProspectDomainError } = require("../errors/ProspectDomainError");

class CommunicationChannel {
  /**
   * @param {Object} props
   */
  constructor(props) {
    this.channelType = props.channelType;
    this.channelUserId = props.channelUserId;
    this.channelMetadata = props.channelMetadata || {};
    this.isPrimary = Boolean(props.isPrimary);
    this.lastSeenAt = props.lastSeenAt || null;
  }

  /**
   * @param {Object} channel
   * @param {number} index
   * @returns {CommunicationChannel}
   */
  static create(channel, index = 0) {
    if (!channel || typeof channel !== "object") {
      throw new ProspectDomainError(`Invalid communication channel at index ${index}.`, {
        publicCode: "VALIDATION_ERROR"
      });
    }

    if (!CHANNEL_TYPES.includes(channel.channelType)) {
      throw new ProspectDomainError(`Invalid channel type: ${channel.channelType}`, {
        publicCode: "INVALID_CHANNEL_TYPE"
      });
    }

    if (!channel.channelUserId) {
      throw new ProspectDomainError(`channelUserId is required for channel ${index}.`, {
        publicCode: "VALIDATION_ERROR"
      });
    }

    return new CommunicationChannel({
      channelType: channel.channelType,
      channelUserId: String(channel.channelUserId),
      channelMetadata: channel.channelMetadata || {},
      isPrimary: Boolean(channel.isPrimary),
      lastSeenAt: channel.lastSeenAt || null
    });
  }

  /**
   * @param {Array|null|undefined} channels
   * @returns {CommunicationChannel[]}
   */
  static createList(channels) {
    if (channels == null) {
      return [];
    }

    if (!Array.isArray(channels)) {
      throw new ProspectDomainError("communicationChannels must be an array.", {
        publicCode: "VALIDATION_ERROR"
      });
    }

    return channels.map((channel, index) => CommunicationChannel.create(channel, index));
  }

  toJSON() {
    return {
      channelType: this.channelType,
      channelUserId: this.channelUserId,
      channelMetadata: this.channelMetadata,
      isPrimary: this.isPrimary,
      lastSeenAt: this.lastSeenAt
    };
  }
}

module.exports = {
  CommunicationChannel
};
