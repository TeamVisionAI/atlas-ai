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
const { getCachedConnectionStatus } = require("./meta/metaConnectionHealthService");

function getGraphVersion() {
  return process.env.META_GRAPH_API_VERSION || "v21.0";
}

function getMetaAppId() {
  return process.env.META_APP_ID;
}

function getMetaAppSecret() {
  return process.env.META_APP_SECRET;
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
  const message = STAGE_MESSAGES[stage] || cause?.message || "Embedded signup failed.";

  return Object.assign(new Error(message), {
    statusCode: STAGE_STATUS_CODES[stage] || 500,
    publicCode: stage,
    stage,
    recoverable: true
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

  if (graphError) {
    return {
      error: "META_API_ERROR",
      message: graphError.error_user_msg || graphError.message || "Meta API request failed.",
      code: graphError.code || null,
      type: graphError.type || null
    };
  }

  return {
    error: "META_EXCHANGE_FAILED",
    message: error?.message || "Meta embedded signup exchange failed."
  };
}

async function exchangeAuthorizationCodeForToken(code) {
  validateMetaEmbeddedSignupEnvironment({ strict: true });

  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const version = getGraphVersion();

  const response = await axios.get(`https://graph.facebook.com/${version}/oauth/access_token`, {
    params: {
      client_id: appId,
      client_secret: appSecret,
      code
    },
    timeout: 15000
  });

  const accessToken = response.data?.access_token;

  if (!accessToken) {
    throw Object.assign(new Error("Meta did not return an access token."), {
      statusCode: 502,
      publicCode: "META_TOKEN_MISSING"
    });
  }

  metaLogger.info("authorization_code_exchanged", {
    graphVersion: version
  });

  return accessToken;
}

async function fetchPhoneNumberDetails(phoneNumberId, accessToken) {
  const version = getGraphVersion();

  const response = await axios.get(`https://graph.facebook.com/${version}/${phoneNumberId}`, {
    params: {
      fields: "id,display_phone_number,verified_name,quality_rating",
      access_token: accessToken
    },
    timeout: 15000
  });

  return response.data;
}

async function fetchWabaDetails(wabaId, accessToken) {
  const version = getGraphVersion();

  const response = await axios.get(`https://graph.facebook.com/${version}/${wabaId}`, {
    params: {
      fields: "id,name,account_review_status",
      access_token: accessToken
    },
    timeout: 15000
  });

  return response.data;
}

async function discoverWhatsAppAssets(accessToken) {
  const version = getGraphVersion();

  const response = await axios.get(`https://graph.facebook.com/${version}/me`, {
    params: {
      fields:
        "businesses{owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}}",
      access_token: accessToken
    },
    timeout: 15000
  });

  const businesses = response.data?.businesses?.data || [];

  for (const business of businesses) {
    const wabas = business?.owned_whatsapp_business_accounts?.data || [];

    for (const waba of wabas) {
      const phoneNumbers = waba?.phone_numbers?.data || [];

      if (phoneNumbers.length) {
        return {
          wabaId: waba.id,
          phoneNumberId: phoneNumbers[0].id,
          displayPhoneNumber: phoneNumbers[0].display_phone_number || null,
          verifiedName: phoneNumbers[0].verified_name || waba.name || null
        };
      }

      if (waba.id) {
        return {
          wabaId: waba.id,
          phoneNumberId: null,
          displayPhoneNumber: null,
          verifiedName: waba.name || null
        };
      }
    }
  }

  return null;
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

async function resolveConnectionAssets({ accessToken, wabaId, phoneNumberId }) {
  let resolvedWabaId = wabaId || null;
  let resolvedPhoneNumberId = phoneNumberId || null;
  let displayPhoneNumber = null;
  let verifiedName = null;

  if (resolvedWabaId) {
    await fetchWabaDetails(resolvedWabaId, accessToken);
  }

  if (resolvedPhoneNumberId) {
    const phone = await fetchPhoneNumberDetails(resolvedPhoneNumberId, accessToken);
    resolvedPhoneNumberId = phone.id;
    displayPhoneNumber = phone.display_phone_number || null;
    verifiedName = phone.verified_name || null;
  }

  if (!resolvedWabaId || !resolvedPhoneNumberId) {
    const discovered = await discoverWhatsAppAssets(accessToken);

    if (discovered) {
      resolvedWabaId = resolvedWabaId || discovered.wabaId;
      resolvedPhoneNumberId = resolvedPhoneNumberId || discovered.phoneNumberId;
      displayPhoneNumber = displayPhoneNumber || discovered.displayPhoneNumber;
      verifiedName = verifiedName || discovered.verifiedName;
    }
  }

  if (!resolvedWabaId) {
    throw Object.assign(new Error("Unable to determine WhatsApp Business Account ID."), {
      stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED
    });
  }

  if (!resolvedPhoneNumberId) {
    throw Object.assign(new Error("Unable to determine phone number ID."), {
      stage: COMPLETION_STAGES.ASSET_DISCOVERY_FAILED
    });
  }

  return {
    wabaId: resolvedWabaId,
    phoneNumberId: resolvedPhoneNumberId,
    displayPhoneNumber,
    verifiedName
  };
}

/**
 * @param {{ code: string, wabaId?: string, phoneNumberId?: string, onboardingType?: string }} input
 */
async function completeEmbeddedSignupExchange(input) {
  const code = String(input.code || "").trim();

  if (!code) {
    throw Object.assign(new Error("Authorization code is required."), {
      statusCode: 400,
      publicCode: "CODE_REQUIRED"
    });
  }

  if (isAuthorizationCodeUsed(code)) {
    throw Object.assign(new Error("Authorization code was already exchanged."), {
      statusCode: 409,
      publicCode: "CODE_ALREADY_USED"
    });
  }

  metaLogger.info("embedded_signup_exchange_started", {
    onboardingType: input.onboardingType || "whatsapp_business_app"
  });

  let accessToken;

  try {
    accessToken = await exchangeAuthorizationCodeForToken(code);
  } catch (error) {
    logCompletionStageFailure(COMPLETION_STAGES.OAUTH_EXCHANGE_FAILED, {
      message: error.response?.data?.error?.message || error.message
    });
    throw createCompletionStageError(COMPLETION_STAGES.OAUTH_EXCHANGE_FAILED, error);
  }

  let assets;

  try {
    assets = await resolveConnectionAssets({
      accessToken,
      wabaId: input.wabaId || null,
      phoneNumberId: input.phoneNumberId || null
    });
  } catch (error) {
    logCompletionStageFailure(COMPLETION_STAGES.ASSET_DISCOVERY_FAILED, {
      message: error.message
    });
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

  try {
    saved = await repository.saveConnection({
      waba_id: assets.wabaId,
      phone_number_id: assets.phoneNumberId,
      connection_type: input.onboardingType || "whatsapp_business_app",
      status: "connected",
      access_token: accessToken,
      display_phone_number: assets.displayPhoneNumber,
      verified_name: assets.verifiedName,
      last_health_status: "healthy",
      last_health_checked_at: new Date().toISOString()
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

async function getEmbeddedSignupStatus() {
  return getCachedConnectionStatus();
}

module.exports = {
  COMPLETION_STAGES,
  completeEmbeddedSignupExchange,
  getEmbeddedSignupStatus,
  sanitizeMetaError,
  exchangeAuthorizationCodeForToken,
  resolveConnectionAssets,
  subscribeWabaToApp
};
