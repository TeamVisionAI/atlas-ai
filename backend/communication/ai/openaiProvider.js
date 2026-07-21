/**
 * Sprint 12.2 — OpenAI provider (internal to AI adapter).
 */

const axios = require("axios");
const { LOG_COMPONENTS, logCommunication } = require("../logging/communicationLogger");

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_SYSTEM_PROMPT =
  "You are Atlas AI, a helpful and concise communication assistant. " +
  "Respond naturally in the same language the user writes in. " +
  "Do not run recruiting, qualification, or scheduling workflows unless explicitly asked.";

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @param {Object} [options]
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {string} [options.systemPrompt]
 */
async function callOpenAI(messages, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || "";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = options.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  logCommunication(LOG_COMPONENTS.AI, "Request sent", {
    provider: "openai",
    model,
    messageCount: messages.length
  });

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages,
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  const text = response.data?.choices?.[0]?.message?.content?.trim() || "";

  logCommunication(LOG_COMPONENTS.AI, "Response received", {
    provider: "openai",
    model,
    responseLength: text.length
  });

  return {
    text,
    provider: "openai",
    model
  };
}

module.exports = {
  callOpenAI,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_MODEL
};
