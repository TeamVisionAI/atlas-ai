/**
 * BR-174 — OpenAI adapter for semantic extraction.
 * Returns provider-neutral SemanticInterpretation after JSON validation.
 * Does not persist facts or decide next actions.
 */

const axios = require("axios");
const { validateSemanticInterpretation } = require("./semanticInterpretationSchema");
const { DEFAULT_MODEL } = require("./semanticInterpreterConfig");

const CHAT_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You extract recruiting-conversation meaning for Atlas.",
  "Return JSON only matching the given schema.",
  "Do not invent facts that are not in the inbound message or known facts.",
  "Do not decide what Atlas should ask next.",
  "Do not erase a confirmed known fact unless the inbound explicitly corrects it.",
  "Spanish 'Sur Carolina' / 'carolina del sur' is US state SC.",
  "'Bluftton' is a city candidate for Bluffton.",
  "Citizenship / legal authorization language authorizes work (workAuthorization=true).",
  "Refusing SSN is ssnPrivacy, not a work-authorization denial.",
  "Phrases like 'si no se trata sobre seguros puedes escribirme' are an insurance-condition objection.",
  "Reschedule language (reprogramar / reprogramarla / move my interview) is schedulingIntent=reschedule."
].join(" ");

function buildMinimalContextPayload({ inboundText, context = {} } = {}) {
  const facts = context.knownFacts || {};
  return {
    inboundText: String(inboundText || "").slice(0, 500),
    lastQuestionAsked: context.conversation?.lastQuestionAsked || null,
    lastAtlasOutboundPreview: String(context.conversation?.lastAtlasOutboundText || "").slice(
      0,
      180
    ),
    knownFacts: {
      city: facts.city || null,
      state: facts.state || null,
      cityCertainty: facts.cityCertainty || null,
      stateCertainty: facts.stateCertainty || null,
      workAuthorization: facts.workAuthorization ?? null,
      workAuthorizationStatus: facts.workAuthorizationStatus || null
    },
    appointment: {
      status: context.appointment?.status || null,
      hasProposedTime: Boolean(context.appointment?.proposedTime)
    },
    preferredLanguage: context.preferredLanguage || null
  };
}

function estimateCostUsd({ promptTokens = 0, completionTokens = 0 } = {}) {
  // gpt-4o-mini list prices used for observability only (USD / 1M tokens).
  const inputRate = 0.15;
  const outputRate = 0.6;
  return Number(
    ((promptTokens * inputRate + completionTokens * outputRate) / 1_000_000).toFixed(6)
  );
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  const fenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(fenced);
  } catch {
    return null;
  }
}

async function interpretWithOpenAI({ inboundText, context, config, apiKey, fetchImpl } = {}) {
  const key = apiKey || process.env.OPENAI_API_KEY || "";
  if (!key) {
    return {
      ok: false,
      reason: "OPENAI_API_KEY_MISSING",
      interpretation: null,
      usage: null
    };
  }

  const model = config?.model || DEFAULT_MODEL;
  const timeoutMs = config?.timeoutMs || 1500;
  const payload = buildMinimalContextPayload({ inboundText, context });
  const body = {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          extract: {
            intent: "string",
            language: "spanish|english|unknown",
            confidence: "0-1",
            facts: {
              city: "string|null",
              state: "USPS or null",
              cityCanonical: "string|null",
              workAuthorization: "boolean|null",
              workAuthorizationStatus: "string|null"
            },
            corrections: [],
            objections: [{ kind: "string", detail: "string|null" }],
            schedulingIntent: "none|propose|confirm|reschedule|cancel",
            requestedDate: "string|null",
            requestedTime: "string|null",
            requestedDayPart: "string|null",
            meetingPreference: "string|null",
            needsClarification: "boolean",
            clarificationReason: "string|null",
            safety: { ssnPrivacy: "boolean", optOut: "boolean", humanRequired: "boolean" }
          },
          context: payload
        })
      }
    ]
  };

  const started = Date.now();
  try {
    const post =
      fetchImpl ||
      ((url, request) =>
        axios.post(url, request.body, {
          headers: request.headers,
          timeout: request.timeout
        }));
    const response = await post(CHAT_URL, {
      body,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      timeout: timeoutMs
    });

    const data = response.data || response;
    const parsed = parseJsonObject(data?.choices?.[0]?.message?.content);
    const validated = validateSemanticInterpretation(parsed);
    const usage = data?.usage || {};
    const promptTokens = Number(usage.prompt_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || 0);

    return {
      ok: validated.ok,
      reason: validated.ok ? null : "INVALID_SEMANTIC_JSON",
      errors: validated.errors,
      interpretation: validated.interpretation,
      usage: {
        provider: "openai",
        model,
        latencyMs: Date.now() - started,
        promptTokens,
        completionTokens,
        totalTokens: Number(usage.total_tokens || promptTokens + completionTokens),
        estimatedCostUsd: estimateCostUsd({ promptTokens, completionTokens })
      }
    };
  } catch (error) {
    const timedOut =
      error?.code === "ECONNABORTED" ||
      /timeout/i.test(String(error?.message || ""));
    return {
      ok: false,
      reason: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_FAILURE",
      interpretation: null,
      usage: {
        provider: "openai",
        model,
        latencyMs: Date.now() - started,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0
      },
      error: error.message
    };
  }
}

module.exports = {
  interpretWithOpenAI,
  buildMinimalContextPayload,
  estimateCostUsd,
  SYSTEM_PROMPT
};
