/**
 * Sprint 12.2 — AI adapter isolates the Communication Gateway from AI providers.
 * Gateway and MessageRouter remain provider-agnostic.
 */

const crypto = require("crypto");

const { MessageDirection } = require("../constants/MessageDirection");
const { LOG_COMPONENTS, logCommunication } = require("../logging/communicationLogger");
const { callOpenAI, DEFAULT_SYSTEM_PROMPT } = require("./openaiProvider");

const FALLBACK_REPLY =
  "Thanks for your message. I'm having a little trouble responding right now, but someone from our team will follow up soon.";

const AI_PROVIDER = Object.freeze({
  OPENAI: "openai"
});

class AIAdapter {
  /**
   * @param {Object} [options]
   * @param {string} [options.provider]
   * @param {string} [options.systemPrompt]
   */
  constructor(options = {}) {
    this.provider = options.provider || AI_PROVIDER.OPENAI;
    this.systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * @param {import('../models/GatewayMessage').GatewayMessage} inboundMessage
   * @param {import('../models/GatewayMessage').GatewayMessage[]} history
   * @returns {Promise<{ text: string, provider: string, model?: string, fallback?: boolean, error?: string }>}
   */
  async generateReply(inboundMessage, history = []) {
    try {
      const messages = this.buildProviderMessages(inboundMessage, history);

      if (this.provider === AI_PROVIDER.OPENAI) {
        const result = await callOpenAI(messages);
        return result;
      }

      throw new Error(`Unsupported AI provider: ${this.provider}`);
    } catch (error) {
      logCommunication(LOG_COMPONENTS.AI, "Request failed", {
        level: "error",
        provider: this.provider,
        error: error.message
      });

      return {
        text: FALLBACK_REPLY,
        provider: this.provider,
        fallback: true,
        error: error.message
      };
    }
  }

  /**
   * @param {import('../models/GatewayMessage').GatewayMessage} inboundMessage
   * @param {import('../models/GatewayMessage').GatewayMessage[]} history
   */
  buildProviderMessages(inboundMessage, history) {
    const messages = [{ role: "system", content: this.systemPrompt }];

    for (const entry of history) {
      if (!entry.text) {
        continue;
      }

      messages.push({
        role: entry.direction === MessageDirection.OUTBOUND ? "assistant" : "user",
        content: entry.text
      });
    }

    if (inboundMessage.text) {
      const last = messages[messages.length - 1];

      if (!(last?.role === "user" && last.content === inboundMessage.text)) {
        messages.push({ role: "user", content: inboundMessage.text });
      }
    }

    return messages;
  }

  /**
   * Build a channel-agnostic outbound GatewayMessage from AI output.
   * @param {import('../models/GatewayMessage').GatewayMessage} inboundMessage
   * @param {{ text: string, provider?: string, model?: string, fallback?: boolean }} aiResult
   */
  buildOutboundMessage(inboundMessage, aiResult) {
    const { GatewayMessage } = require("../models/GatewayMessage");
    const { MessageType } = require("../constants/MessageType");

    return new GatewayMessage({
      id: crypto.randomUUID(),
      conversationId: inboundMessage.conversationId,
      channel: inboundMessage.channel,
      senderId: inboundMessage.recipientId,
      recipientId: inboundMessage.senderId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEXT,
      text: aiResult.text,
      metadata: {
        source: "ai",
        provider: aiResult.provider || this.provider,
        model: aiResult.model || null,
        fallback: Boolean(aiResult.fallback)
      }
    });
  }
}

module.exports = {
  AIAdapter,
  AI_PROVIDER,
  FALLBACK_REPLY
};
