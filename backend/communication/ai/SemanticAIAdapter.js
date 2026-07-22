/**
 * Sprint 12.0.1 — Bridges Communication Gateway to Atlas Conversation Engine.
 * Implements BR-011 / BR-012 recruiting coordinator responses via semantic engine.
 */

const crypto = require("crypto");
const { AIAdapter } = require("./AIAdapter");
const { handleIncomingMessage } = require("../../core/conversationEngine");
const { buildMessengerStorageKey } = require("../../core/messengerConstants");
const { CHANNEL } = require("../models/Channel");
const { LOG_COMPONENTS, logCommunication } = require("../logging/communicationLogger");

const FALLBACK_REPLY =
  "Thanks for your message. Someone from our team will follow up with you shortly.";

function adapterTrace(details = {}) {
  console.log("[ATLAS ADAPTER TRACE]", JSON.stringify({ ts: new Date().toISOString(), ...details }));
}

function resolveStorageKey(inboundMessage) {
  return inboundMessage.channel === CHANNEL.MESSENGER
    ? buildMessengerStorageKey(inboundMessage.senderId)
    : inboundMessage.senderId;
}

function describeEngineResult(engineResult) {
  if (engineResult === null) {
    return "null";
  }

  if (engineResult === undefined) {
    return "undefined";
  }

  if (typeof engineResult !== "object") {
    return typeof engineResult;
  }

  if (!Object.prototype.hasOwnProperty.call(engineResult, "reply")) {
    return "object without reply property";
  }

  const reply = engineResult.reply;

  if (reply === null) {
    return "object with reply=null";
  }

  if (reply === undefined) {
    return "object with reply=undefined";
  }

  const replyText = String(reply);

  if (!replyText.trim()) {
    return "object with reply=empty string";
  }

  return `object with reply length=${replyText.length}`;
}

function logAdapterFallback(traceId, storageKey, reason, details = {}) {
  adapterTrace({
    traceId,
    storageKey,
    event: "fallback",
    reason,
    ...details
  });
}

class SemanticAIAdapter extends AIAdapter {
  /**
   * @param {import('../models/GatewayMessage').GatewayMessage} inboundMessage
   * @param {import('../models/GatewayMessage').GatewayMessage[]} history
   */
  async generateReply(inboundMessage, history = []) {
    void history;

    const traceId = crypto.randomUUID();
    const rawText = String(inboundMessage.text || "");
    const text = rawText.trim();
    const storageKey = resolveStorageKey(inboundMessage);

    if (!text) {
      logAdapterFallback(traceId, storageKey, "EMPTY_INBOUND_TEXT", {
        inboundTextLength: rawText.length,
        engineResultShape: "not invoked"
      });

      return {
        text: FALLBACK_REPLY,
        provider: "semantic",
        fallback: true,
        error: "EMPTY_INBOUND_TEXT"
      };
    }

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

      adapterTrace({
        traceId,
        storageKey,
        event: "handleIncomingMessage:before",
        inboundTextLength: text.length,
        channel: inboundMessage.channel,
        senderId: inboundMessage.senderId
      });

      const engineResult = await handleIncomingMessage(storageKey, displayName, text, {
        channel: inboundMessage.channel,
        skipConversationLogging: false
      });

      adapterTrace({
        traceId,
        storageKey,
        event: "handleIncomingMessage:after",
        inboundTextLength: text.length,
        engineResultShape: describeEngineResult(engineResult)
      });

      const replyText = String(engineResult?.reply || "").trim();

      if (!replyText) {
        logAdapterFallback(traceId, storageKey, "EMPTY_ENGINE_REPLY", {
          inboundTextLength: text.length,
          engineResultShape: describeEngineResult(engineResult)
        });

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

      logAdapterFallback(traceId, storageKey, "ENGINE_EXCEPTION", {
        inboundTextLength: text.length,
        engineResultShape: "not returned",
        errorMessage: error.message,
        exceptionStack: error.stack || null
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
