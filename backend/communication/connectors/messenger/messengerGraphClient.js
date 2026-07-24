/**
 * Sprint 12.1 — Facebook Graph API client for Messenger (connector-internal).
 */

const axios = require("axios");
const { getMetaGraphApiVersion } = require("../../../core/meta/metaGraphApiVersion");

function getGraphApiVersion() {
  return getMetaGraphApiVersion();
}

function getPageAccessToken(configToken) {
  return configToken || process.env.MESSENGER_PAGE_ACCESS_TOKEN || "";
}

/**
 * @param {Object} params
 * @param {string} params.recipientId
 * @param {string} params.text
 * @param {string} params.pageAccessToken
 */
async function sendTextMessage({ recipientId, text, pageAccessToken }) {
  const token = getPageAccessToken(pageAccessToken);
  const url = `https://graph.facebook.com/${getGraphApiVersion()}/me/messages`;

  const response = await axios.post(
    url,
    {
      recipient: { id: recipientId },
      message: { text }
    },
    {
      params: { access_token: token },
      timeout: 15000
    }
  );

  return {
    success: true,
    providerMessageId: response.data?.message_id || null
  };
}

/**
 * @param {Object} params
 * @param {string} params.recipientId
 * @param {string} params.pageAccessToken
 */
async function markMessageSeen({ recipientId, pageAccessToken }) {
  const token = getPageAccessToken(pageAccessToken);
  const url = `https://graph.facebook.com/${getGraphApiVersion()}/me/messages`;

  await axios.post(
    url,
    {
      recipient: { id: recipientId },
      sender_action: "mark_seen"
    },
    {
      params: { access_token: token },
      timeout: 15000
    }
  );

  return { success: true };
}

/**
 * @param {Object} params
 * @param {string} params.recipientId
 * @param {boolean} params.isTyping
 * @param {string} params.pageAccessToken
 */
async function sendTypingIndicator({ recipientId, isTyping, pageAccessToken }) {
  const token = getPageAccessToken(pageAccessToken);
  const url = `https://graph.facebook.com/${getGraphApiVersion()}/me/messages`;

  await axios.post(
    url,
    {
      recipient: { id: recipientId },
      sender_action: isTyping ? "typing_on" : "typing_off"
    },
    {
      params: { access_token: token },
      timeout: 15000
    }
  );

  return { success: true };
}

/**
 * @param {string} pageAccessToken
 */
async function verifyPageToken(pageAccessToken) {
  const token = getPageAccessToken(pageAccessToken);

  if (!token) {
    return { healthy: false, detail: "MESSENGER_PAGE_ACCESS_TOKEN not configured" };
  }

  try {
    const url = `https://graph.facebook.com/${getGraphApiVersion()}/me`;
    const response = await axios.get(url, {
      params: { access_token: token, fields: "id,name" },
      timeout: 15000
    });

    return {
      healthy: true,
      detail: response.data?.name || response.data?.id || "connected"
    };
  } catch (error) {
    return {
      healthy: false,
      detail: error.response?.data?.error?.message || error.message
    };
  }
}

module.exports = {
  sendTextMessage,
  markMessageSeen,
  sendTypingIndicator,
  verifyPageToken
};
