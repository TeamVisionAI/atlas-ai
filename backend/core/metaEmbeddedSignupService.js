/**
 * Sprint 6 / 6.1 — Meta Embedded Signup server-side exchange and WABA subscription.
 * Secrets stay server-side; never log or return access tokens.
 */

const axios = require("axios");
const { repository, toSafeConnection } = require("../repositories/metaWhatsAppConnectionRepository");
const {
  isAuthorizationCodeUsed,
  markAuthorizationCodeUsed
} = require("./metaEmbeddedSignupRateLimit");
const { metaLogger } = require("./meta/metaLogger");
const { validateMetaEmbeddedSignupEnvironment } = require("./meta/metaEnvironmentValidator");
const { getMetaGraphApiVersion } = require("./meta/metaGraphApiVersion");
const {
  compareAuthorizationCodes,
  traceAuthorizationCode
} = require("./meta/authorizationCodeTrace");
const { readConfiguredFrontendUrl } = require("../config/frontendBaseUrl");

const WHATSAPP_CONNECT_PATH = "/app/settings/whatsapp";
const STAGING_CONNECT_REDIRECT_URI = `https://atlas-ai-git-feature-atlas-staging-teamvisionfinancial.vercel.app${WHATSAPP_CONNECT_PATH}`;

function collectAllowedFrontendOrigins(env = process.env) {
  const origins = new Set([
    "http://localhost:5173",
    "https://localhost:5173",
    "https://teamvisionfinancial.com",
    "https://www.teamvisionfinancial.com"
  ]);
  const configured = readConfiguredFrontendUrl(env);

  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // ignore unparseable FRONTEND_URL
    }
  }

  for (const part of String(env.ATLAS_CORS_ORIGINS || "").split(",")) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      origins.add(new URL(withScheme).origin);
    } catch {
      // ignore unparseable CORS origin
    }
  }

  return origins;
}

function isAtlasOwnedVercelPreviewOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith("-teamvisionfinancial.vercel.app");
  } catch {
    return false;
  }
}

function normalizeConnectRedirectUri(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const url = new URL(raw.trim());

    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }

    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname !== WHATSAPP_CONNECT_PATH) {
      return null;
    }

    return `${url.origin}${WHATSAPP_CONNECT_PATH}`;
  } catch {
    return null;
  }
}

function isAllowlistedConnectRedirectUri(redirectUri, env = process.env) {
  const normalized = normalizeConnectRedirectUri(redirectUri);

  if (!normalized) {
    return false;
  }

  const origin = new URL(normalized).origin;
  return collectAllowedFrontendOrigins(env).has(origin) || isAtlasOwnedVercelPreviewOrigin(origin);
}

function resolveEmbeddedSignupOAuthRedirectUri(candidate, env = process.env) {
  if (candidate != null && String(candidate).trim()) {
    const normalized = normalizeConnectRedirectUri(candidate);

    if (!normalized || !isAllowlistedConnectRedirectUri(normalized, env)) {
      throw Object.assign(new Error("Invalid OAuth redirect URI."), {
        statusCode: 400,
        publicCode: "INVALID_REDIRECT_URI"
      });
    }

    return normalized;
  }

  const configured = readConfiguredFrontendUrl(env);

  if (configured) {
    const fromEnv = normalizeConnectRedirectUri(
      `${String(configured).replace(/\/$/, "")}${WHATSAPP_CONNECT_PATH}`
    );

    if (fromEnv) {
      return fromEnv;
    }
  }

  return STAGING_CONNECT_REDIRECT_URI;
}

function describeOAuthRedirectUriForLogs(redirectUri) {
  try {
    const parsed = new URL(redirectUri);
    return {
      redirectUriHost: parsed.host,
      redirectUriPath: parsed.pathname,
      redirectUriQuery: parsed.search || ""
    };
  } catch {
    return {
      redirectUriHost: null,
      redirectUriPath: null,
      redirectUriQuery: null
    };
  }
}

function getGraphVersion() {
  return getMetaGraphApiVersion();
}

function getMetaAppId() {
  return process.env.META_APP_ID;
}

function getMetaAppSecret() {
  return process.env.META_APP_SECRET;
}

function getMetaExchangeEnvSnapshot() {
  return {
    graphVersion: getGraphVersion(),
    appId: getMetaAppId() || null,
    appSecretPresent: Boolean(getMetaAppSecret()),
    configIdPresent: Boolean(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID),
    appAccessTokenPresent: Boolean(process.env.META_APP_ACCESS_TOKEN),
    graphApiVersionEnv: process.env.META_GRAPH_API_VERSION || null
  };
}

function extractGraphErrorDetails(error) {
  const graphResponseBody = error?.response?.data ?? null;
  const graphError = graphResponseBody?.error ?? null;

  return {
    graphResponseBody,
    graphError,
    graphStatus: error?.response?.status ?? null,
    graphErrorCode: graphError?.code ?? null,
    graphErrorSubcode: graphError?.error_subcode ?? null,
    graphErrorMessage: graphError?.message ?? null,
    graphErrorType: graphError?.type ?? null,
    graphErrorUserMsg: graphError?.error_user_msg ?? null
  };
}

const SECRET_LOG_KEY_PATTERN =
  /^(access_token|token|client_secret|app_secret|authorization|refresh_token|password)$/i;
const SECRET_LOG_VALUE_PATTERN = /\bEAA[A-Za-z0-9]{10,}\b/;

function redactSecretsFromLogDetails(value, depth = 0) {
  if (value == null || depth > 8) {
    return value;
  }

  if (typeof value === "string") {
    if (SECRET_LOG_VALUE_PATTERN.test(value)) {
      return value.replace(SECRET_LOG_VALUE_PATTERN, "[redacted]");
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsFromLogDetails(item, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};

    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_LOG_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactSecretsFromLogDetails(nested, depth + 1);
      }
    }

    return out;
  }

  return value;
}

function graphRequestMetaFromAxiosError(error) {
  const url = error?.config?.url || error?.graphUrl || "";

  if (!url) {
    return {
      graphHost: error?.graphHost || null,
      graphPath: error?.graphPath || null
    };
  }

  try {
    const parsed = new URL(url, "https://graph.facebook.com");
    return {
      graphHost: parsed.host,
      graphPath: parsed.pathname
    };
  } catch {
    return { graphHost: null, graphPath: null };
  }
}

function buildAssetDiscoveryFailureLogDetails(error, context = {}) {
  const graphDetails = extractGraphErrorDetails(error);
  const requestMeta = graphRequestMetaFromAxiosError(error);

  return redactSecretsFromLogDetails({
    message: graphDetails.graphErrorMessage || error?.message || null,
    graphErrorCode: graphDetails.graphErrorCode,
    graphErrorSubcode: graphDetails.graphErrorSubcode,
    graphErrorType: graphDetails.graphErrorType,
    graphErrorUserMsg: graphDetails.graphErrorUserMsg,
    responseStatus: graphDetails.graphStatus,
    graphResponseBody: graphDetails.graphResponseBody,
    graphHost: requestMeta.graphHost,
    graphPath: requestMeta.graphPath,
    wabaId: context.wabaId || null,
    phoneNumberId: context.phoneNumberId || null,
    wabaIdPresent: Boolean(context.wabaId)
  });
}

const COMPLETION_STAGES = Object.freeze({
  OAUTH_EXCHANGE_FAILED: "OAUTH_EXCHANGE_FAILED",
  ASSET_DISCOVERY_FAILED: "ASSET_DISCOVERY_FAILED",
  SUBSCRIBE_FAILED: "SUBSCRIBE_FAILED",
  SAVE_FAILED: "SAVE_FAILED"
});

const STAGE_MESSAGES = Object.freeze({
  [COMPLETION_STAGES.OAUTH_EXCHANGE_FAILED]:
    "Unable to exchange authorization code with Meta.",
  [COMPLETION_STAGES.ASSET_DISCOVERY_FAILED]:
    "Unable to resolve WhatsApp Business assets after authorization.",
  [COMPLETION_STAGES.SUBSCRIBE_FAILED]:
    "Unable to subscribe WhatsApp Business Account to Atlas app.",
  [COMPLETION_STAGES.SAVE_FAILED]: "Unable to persist WhatsApp connection."
});

const STAGE_STATUS_CODES = Object.freeze({
  [COMPLETION_STAGES.OAUTH_EXCHANGE_FAILED]: 502,
  [COMPLETION_STAGES.ASSET_DISCOVERY_FAILED]: 422,
  [COMPLETION_STAGES.SUBSCRIBE_FAILED]: 502,
  [COMPLETION_STAGES.SAVE_FAILED]: 500
});

function createCompletionStageError(stage, cause) {
  const graphDetails = extractGraphErrorDetails(cause);
  const graphError = graphDetails.graphError;
  const defaultMessage = STAGE_MESSAGES[stage] || cause?.message || "Embedded signup failed.";
  const message =
    stage === COMPLETION_STAGES.OAUTH_EXCHANGE_FAILED && graphError
      ? graphError.error_user_msg || graphError.message || defaultMessage
      : defaultMessage;

  return Object.assign(new Error(message), {
    statusCode: STAGE_STATUS_CODES[stage] || cause?.statusCode || 500,
    publicCode: stage,
    stage,
    recoverable: true,
    metaGraphStatus: graphDetails.graphStatus,
    metaGraphError: graphError,
    metaGraphResponse: graphDetails.graphResponseBody
  });
}

function logCompletionStageFailure(stage, details = {}) {
  metaLogger.error("embedded_signup_stage_failed", {
    stage,
    ...details
  });
}

function sanitizeMetaError(error) {
  const graphError = error?.response?.data?.error;
  const graphResponseBody = error?.response?.data ?? null;

  if (graphError) {
    return {
      error: "META_API_ERROR",
      message: graphError.error_user_msg || graphError.message || "Meta API request failed.",
      code: graphError.code ?? null,
      errorSubcode: graphError.error_subcode ?? null,
      type: graphError.type ?? null,
      fbtraceId: graphError.fbtrace_id ?? null,
      metaGraphError: graphError,
      metaGraphResponse: graphResponseBody
    };
  }

  return {
    error: "META_EXCHANGE_FAILED",
    message: error?.message || "Meta embedded signup exchange failed.",
    metaGraphResponse: graphResponseBody
  };
}

async function exchangeAuthorizationCodeForToken(code) {
  validateMetaEmbeddedSignupEnvironment({ strict: true });

  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const version = getGraphVersion();
  const graphUrl = `https://graph.facebook.com/${version}/oauth/access_token`;
  const envSnapshot = getMetaExchangeEnvSnapshot();
  // Implements Meta Embedded Signup Tech Provider contract: client_id, client_secret, code only.
  const requestParams = ["client_id", "client_secret", "code"];

  metaLogger.info(
    "authorization_code_trace",
    traceAuthorizationCode("graph_api_request", code, {
      graphEndpoint: graphUrl,
      httpMethod: "GET",
      requestParams
    })
  );

  metaLogger.info("oauth_access_token_exchange_request", {
    graphEndpoint: graphUrl,
    graphVersion: version,
    httpMethod: "GET",
    appId: envSnapshot.appId,
    appSecretPresent: envSnapshot.appSecretPresent,
    configIdPresent: envSnapshot.configIdPresent,
    appAccessTokenPresent: envSnapshot.appAccessTokenPresent,
    codeLength: String(code || "").length,
    requestParams
  });

  let response;

  try {
    const graphUrlParsed = new URL(graphUrl);

    metaLogger.error("embedded_signup_oauth_runtime_trace", {
      message: "redirect_uri omitted",
      requestParams,
      appId,
      codeLength: String(code || "").length,
      graphHost: graphUrlParsed.host,
      graphPath: graphUrlParsed.pathname
    });

    response = await axios.get(graphUrl, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        code
      },
      timeout: 15000
    });
  } catch (error) {
    const graphDetails = extractGraphErrorDetails(error);

    metaLogger.error("oauth_access_token_exchange_failed", {
      graphEndpoint: graphUrl,
      graphVersion: version,
      appId: envSnapshot.appId,
      appSecretPresent: envSnapshot.appSecretPresent,
      configIdPresent: envSnapshot.configIdPresent,
      appAccessTokenPresent: envSnapshot.appAccessTokenPresent,
      responseStatus: graphDetails.graphStatus,
      graphResponseBody: redactSecretsFromLogDetails(graphDetails.graphResponseBody),
      graphErrorCode: graphDetails.graphErrorCode,
      graphErrorSubcode: graphDetails.graphErrorSubcode,
      graphErrorMessage: graphDetails.graphErrorMessage,
      graphErrorType: graphDetails.graphErrorType,
      graphErrorUserMsg: graphDetails.graphErrorUserMsg,
      requestParams
    });
    throw error;
  }

  const accessToken = response.data?.access_token;

  if (!accessToken) {
    metaLogger.error("oauth_access_token_exchange_missing_token", {
      graphEndpoint: graphUrl,
      graphVersion: version,
      appId: envSnapshot.appId,
      graphResponseBody: redactSecretsFromLogDetails(response.data ?? null)
    });

    throw Object.assign(new Error("Meta did not return an access token."), {
      statusCode: 502,
      publicCode: "META_TOKEN_MISSING",
      metaGraphResponse: response.data ?? null
    });
  }

  metaLogger.info("authorization_code_exchanged", {
    graphVersion: version,
    appId: envSnapshot.appId
  });

  return accessToken;
}

function pickWabaPhoneNumber(phoneNumbers, preferredPhoneNumberId) {
  const list = Array.isArray(phoneNumbers) ? phoneNumbers.filter((row) => row?.id) : [];

  if (preferredPhoneNumberId) {
    const matched = list.find((row) => String(row.id) === String(preferredPhoneNumberId));

    if (matched) {
      return matched;
    }

    throw Object.assign(
      new Error("FINISH phone_number_id was not found on the WhatsApp Business Account."),
      { stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED }
    );
  }

  if (list.length === 1) {
    return list[0];
  }

  if (list.length === 0) {
    throw Object.assign(new Error("No WhatsApp phone numbers were found for this WABA."), {
      stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED
    });
  }

  throw Object.assign(
    new Error("Multiple WhatsApp phone numbers found; FINISH phone_number_id is required."),
    { stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED }
  );
}

// Prefer Embedded Signup FINISH WABA ID, then GET /{waba_id}/phone_numbers.
// Never GET /me — business-integration system-user tokens reject it (ASSET_DISCOVERY_FAILED Graph 400).
async function fetchWabaPhoneNumbers(wabaId, accessToken) {
  const version = getGraphVersion();
  const graphUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/phone_numbers`;

  const response = await axios.get(graphUrl, {
    params: {
      fields: "id,display_phone_number,verified_name",
      access_token: accessToken
    },
    timeout: 15000
  });

  return Array.isArray(response.data?.data) ? response.data.data : [];
}

async function subscribeWabaToApp(wabaId, accessToken) {
  const version = getGraphVersion();

  await axios.post(
    `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      timeout: 15000
    }
  );

  metaLogger.info("waba_subscribed", { wabaId });
}

async function resolveConnectionAssets({ accessToken, wabaId, phoneNumberId, businessId }) {
  const resolvedWabaId = String(wabaId || "").trim() || null;
  const preferredPhoneNumberId = String(phoneNumberId || "").trim() || null;
  const resolvedBusinessId = String(businessId || "").trim() || null;

  if (!resolvedWabaId) {
    throw Object.assign(
      new Error("WhatsApp Business Account ID is required from Embedded Signup FINISH."),
      {
        stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED,
        statusCode: 422,
        publicCode: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED
      }
    );
  }

  if (!accessToken) {
    throw Object.assign(new Error("Access token is required to resolve WhatsApp assets."), {
      stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED
    });
  }

  const phoneNumbers = await fetchWabaPhoneNumbers(resolvedWabaId, accessToken);
  const phone = pickWabaPhoneNumber(phoneNumbers, preferredPhoneNumberId);
  const resolvedPhoneNumberId = String(phone.id || "").trim();
  const displayPhoneNumber = phone.display_phone_number || null;
  const verifiedName = phone.verified_name || null;

  if (!resolvedPhoneNumberId) {
    throw Object.assign(new Error("Unable to determine phone number ID."), {
      stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED
    });
  }

  return {
    businessId: resolvedBusinessId,
    wabaId: resolvedWabaId,
    phoneNumberId: resolvedPhoneNumberId,
    displayPhoneNumber,
    verifiedName,
    businessName: verifiedName || null
  };
}

/**
 * @param {{
 *   organizationId: string,
 *   code: string,
 *   wabaId?: string,
 *   phoneNumberId?: string,
 *   businessId?: string,
 *   onboardingType?: string,
 *   redirectUri?: string,
 *   connectionRepository?: object
 * }} input
 */
async function completeEmbeddedSignupExchange(input) {
  const organizationId = String(input.organizationId || "").trim();
  const connectionRepository = input.connectionRepository || repository;

  if (!organizationId) {
    throw Object.assign(new Error("Organization context is required."), {
      statusCode: 400,
      publicCode: "ORGANIZATION_REQUIRED"
    });
  }
  const rawCode = String(input.code || "");
  const code = rawCode.trim();
  const wabaId = String(input.wabaId || "").trim();
  const phoneNumberId = String(input.phoneNumberId || "").trim();
  const businessId = String(input.businessId || "").trim();
  const trimComparison = compareAuthorizationCodes(rawCode, code, "service_trim");

  metaLogger.info("authorization_code_trace", trimComparison);

  if (!code) {
    throw Object.assign(new Error("Authorization code is required."), {
      statusCode: 400,
      publicCode: "CODE_REQUIRED"
    });
  }

  if (!wabaId) {
    logCompletionStageFailure(COMPLETION_STAGES.ASSET_DISCOVERY_FAILED, {
      message: "WhatsApp Business Account ID is required from Embedded Signup FINISH.",
      responseStatus: null,
      graphResponseBody: null,
      wabaId: null,
      phoneNumberId: phoneNumberId || null,
      wabaIdPresent: false
    });
    throw Object.assign(
      new Error("WhatsApp Business Account ID is required from Embedded Signup FINISH."),
      {
        statusCode: 422,
        publicCode: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED,
        stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED,
        recoverable: true
      }
    );
  }

  metaLogger.info(
    "authorization_code_trace",
    traceAuthorizationCode("service_exchange", code, {
      onboardingType: input.onboardingType || "whatsapp_business_app"
    })
  );

  if (isAuthorizationCodeUsed(code)) {
    throw Object.assign(new Error("Authorization code was already exchanged."), {
      statusCode: 409,
      publicCode: "CODE_ALREADY_USED"
    });
  }

  metaLogger.info("embedded_signup_exchange_started", {
    onboardingType: input.onboardingType || "whatsapp_business_app",
    ...getMetaExchangeEnvSnapshot(),
    codeLength: code.length,
    wabaIdPresent: true
  });

  let accessToken;

  try {
    accessToken = await exchangeAuthorizationCodeForToken(code);
  } catch (error) {
    const graphDetails = extractGraphErrorDetails(error);

    logCompletionStageFailure(COMPLETION_STAGES.OAUTH_EXCHANGE_FAILED, {
      message: graphDetails.graphErrorMessage || error.message,
      graphErrorCode: graphDetails.graphErrorCode,
      graphErrorSubcode: graphDetails.graphErrorSubcode,
      graphResponseBody: redactSecretsFromLogDetails(graphDetails.graphResponseBody),
      responseStatus: graphDetails.graphStatus,
      ...getMetaExchangeEnvSnapshot()
    });
    throw createCompletionStageError(COMPLETION_STAGES.OAUTH_EXCHANGE_FAILED, error);
  }

  let assets;

  try {
    assets = await resolveConnectionAssets({
      accessToken,
      wabaId,
      phoneNumberId: phoneNumberId || null,
      businessId: businessId || null
    });
  } catch (error) {
    logCompletionStageFailure(
      COMPLETION_STAGES.ASSET_DISCOVERY_FAILED,
      buildAssetDiscoveryFailureLogDetails(error, {
        wabaId,
        phoneNumberId: phoneNumberId || null
      })
    );
    throw createCompletionStageError(COMPLETION_STAGES.ASSET_DISCOVERY_FAILED, error);
  }

  try {
    await subscribeWabaToApp(assets.wabaId, accessToken);
  } catch (error) {
    logCompletionStageFailure(COMPLETION_STAGES.SUBSCRIBE_FAILED, {
      wabaId: assets.wabaId,
      message: error.response?.data?.error?.message || error.message
    });
    throw createCompletionStageError(COMPLETION_STAGES.SUBSCRIBE_FAILED, error);
  }

  let saved;
  const now = new Date().toISOString();

  try {
    saved = await connectionRepository.saveConnection(organizationId, {
      business_id: assets.businessId || null,
      waba_id: assets.wabaId,
      phone_number_id: assets.phoneNumberId,
      connection_type: input.onboardingType || "whatsapp_business_app",
      status: "connected",
      access_token: accessToken,
      display_phone_number: assets.displayPhoneNumber,
      business_name: assets.businessName,
      verified_name: assets.verifiedName,
      last_health_status: "healthy",
      last_health_checked_at: now,
      connected_at: now,
      last_sync_at: now
    });
  } catch (error) {
    logCompletionStageFailure(COMPLETION_STAGES.SAVE_FAILED, {
      wabaId: assets.wabaId,
      phoneNumberId: assets.phoneNumberId,
      message: error.message
    });
    throw createCompletionStageError(COMPLETION_STAGES.SAVE_FAILED, error);
  }

  markAuthorizationCodeUsed(code);

  metaLogger.info("embedded_signup_exchange_completed", {
    wabaId: saved.waba_id,
    phoneNumberId: saved.phone_number_id
  });

  return {
    success: true,
    connection: toSafeConnection(saved)
  };
}

async function getEmbeddedSignupStatus(organizationId) {
  const connection = await repository.getConnection(organizationId);

  return {
    connected: Boolean(connection && connection.status === "connected"),
    connection: toSafeConnection(connection),
    storageKind: repository.getStorageKind()
  };
}

module.exports = {
  COMPLETION_STAGES,
  WHATSAPP_CONNECT_PATH,
  STAGING_CONNECT_REDIRECT_URI,
  completeEmbeddedSignupExchange,
  getEmbeddedSignupStatus,
  sanitizeMetaError,
  extractGraphErrorDetails,
  redactSecretsFromLogDetails,
  buildAssetDiscoveryFailureLogDetails,
  getMetaExchangeEnvSnapshot,
  exchangeAuthorizationCodeForToken,
  resolveEmbeddedSignupOAuthRedirectUri,
  describeOAuthRedirectUriForLogs,
  fetchWabaPhoneNumbers,
  resolveConnectionAssets,
  subscribeWabaToApp
};
