/**
 * Sprint 12.0.1 — Bridges Communication Gateway to Atlas Conversation Engine.
 * Implements BR-011 / BR-012 recruiting coordinator responses via semantic engine.
 */

const { AIAdapter } = require("./AIAdapter");
const { handleIncomingMessage } = require("../../core/conversationEngine");
const { buildMessengerStorageKey } = require("../../core/messengerConstants");
const { CHANNEL } = require("../models/Channel");
const { LOG_COMPONENTS, logCommunication } = require("../logging/communicationLogger");

const FALLBACK_REPLY =
  "Thanks for your message. Someone from our team will follow up with you shortly.";

class SemanticAIAdapter extends AIAdapter {
  /**
   * @param {import('../models/GatewayMessage').GatewayMessage} inboundMessage
   * @param {import('../models/GatewayMessage').GatewayMessage[]} history
   */
  async generateReply(inboundMessage, history = []) {
    void history;

    const text = String(inboundMessage.text || "").trim();

    if (!text) {
      return {
        text: FALLBACK_REPLY,
        provider: "semantic",
        fallback: true,
        error: "EMPTY_INBOUND_TEXT"
      };
    }

    const storageKey =
      inboundMessage.channel === CHANNEL.MESSENGER
        ? buildMessengerStorageKey(inboundMessage.senderId)
        : inboundMessage.senderId;

    const displayName =
      inboundMessage.metadata?.displayName ||
      inboundMessage.metadata?.senderName ||
      "Unknown";

    try {
      logCommunication(LOG_COMPONENTS.AI, "Conversation engine invoked", {
        channel: inboundMessage.channel,
        senderId: inboundMessage.senderId,
        storageKey
      });

      const engineResult = await handleIncomingMessage(storageKey, displayName, text, {
        channel: inboundMessage.channel,
        skipConversationLogging: false
      });

      const replyText = String(engineResult?.reply || "").trim();

      if (!replyText) {
        return {
          text: FALLBACK_REPLY,
          provider: "semantic",
          fallback: true,
          error: "EMPTY_ENGINE_REPLY"
        };
      }

      return {
        text: replyText,
        provider: "semantic",
        handoff: engineResult?.handoff || null
      };
    } catch (error) {
      logCommunication(LOG_COMPONENTS.AI, "Conversation engine failed", {
        level: "error",
        channel: inboundMessage.channel,
        senderId: inboundMessage.senderId,
        error: error.message
      });

      return {
        text: FALLBACK_REPLY,
        provider: "semantic",
        fallback: true,
        error: error.message
      };
    }
  }
}

module.exports = {
  SemanticAIAdapter,
  FALLBACK_REPLY
};
