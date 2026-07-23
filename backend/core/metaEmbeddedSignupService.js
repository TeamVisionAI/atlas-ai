/**
 * Sprint 6 / 6.1 — Meta Embedded Signup server-side exchange and WABA subscription.
 * Secrets stay server-side; never log or return access tokens.
 */

const axios = require("axios");
const { repository, toSafeConnection } = require("../repositories/metaWhatsAppConnectionRepository");
const {
  createJsonMetaPlatformConnectionRepository,
  toSafePlatformConnection
} = require("../repositories/jsonMetaPlatformConnectionRepository");
const {
  isAuthorizationCodeUsed,
  markAuthorizationCodeUsed
} = require("./metaEmbeddedSignupRateLimit");
const { metaLogger } = require("./meta/metaLogger");
const { validateMetaEmbeddedSignupEnvironment } = require("./meta/metaEnvironmentValidator");
const { getCachedConnectionStatus } = require("./meta/metaConnectionHealthService");

const platformRepository = createJsonMetaPlatformConnectionRepository();

function buildChannelStatus(whatsappStatus) {
  return {
    facebook: "connected",
    messenger: "connected",
    whatsapp: whatsappStatus
  };
}

async function discoverPlatformIdentity(accessToken) {
  const version = getGraphVersion();

  const meResponse = await axios.get(`https://graph.facebook.com/${version}/me`, {
    params: {
      fields: "id,name",
      access_token: accessToken
    },
    timeout: 15000
  });

  let pageId = process.env.MESSENGER_PAGE_ID || null;

  try {
    const accountsResponse = await axios.get(`https://graph.facebook.com/${version}/me/accounts`, {
      params: {
        fields: "id,name",
        access_token: accessToken
      },
      timeout: 15000
    });

    const pages = accountsResponse.data?.data || [];

    if (pages.length) {
      pageId = pageId || pages[0].id;
    }
  } catch (error) {
    metaLogger.warn("platform_page_discovery_skipped", {
      message: error.response?.data?.error?.message || error.message
    });
  }

  return {
    userId: meResponse.data?.id || null,
    userName: meResponse.data?.name || null,
    pageId
  };
}

async function tryResolveWhatsAppAssets({ accessToken, wabaId, phoneNumberId }) {
  try {
    return await resolveConnectionAssets({
      accessToken,
      wabaId,
      phoneNumberId
    });
  } catch (error) {
    if (error.stage === COMPLETION_STAGES.ASSET_DISCOVERY_FAILED) {
      metaLogger.info("whatsapp_assets_unavailable", {
        message: error.message
      });
      return null;
    }

    throw error;
  }
}

async function saveWhatsAppConnectionFromAssets({
  accessToken,
  assets,
  onboardingType
}) {
  try {
    await subscribeWabaToApp(assets.wabaId, accessToken);
  } catch (error) {
    throw createCompletionStageError(COMPLETION_STAGES.SUBSCRIBE_FAILED, error);
  }

  try {
    return await repository.saveConnection({
      waba_id: assets.wabaId,
      phone_number_id: assets.phoneNumberId,
      connection_type: onboardingType || "whatsapp_business_app",
      status: "connected",
      access_token: accessToken,
      display_phone_number: assets.displayPhoneNumber,
      verified_name: assets.verifiedName,
      last_health_status: "healthy",
      last_health_checked_at: new Date().toISOString()
    });
  } catch (error) {
    throw createCompletionStageError(COMPLETION_STAGES.SAVE_FAILED, error);
  }
}

function getGraphVersion() {
  return process.env.META_GRAPH_API_VERSION || "v25.0";
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
  const graphUrl = `https://graph.facebook.com/${version}/oauth/access_token`;
  const requestParams = {
    client_id: appId,
    client_secret: appSecret,
    code
  };

  let response;

  try {
    response = await axios.get(graphUrl, {
      params: requestParams,
      timeout: 15000
    });
  } catch (error) {
    metaLogger.error("oauth_access_token_exchange_failed", {
      graphRequest: {
        method: "GET",
        url: graphUrl,
        params: {
          client_id: appId,
          client_secret: "[REDACTED]",
          code
        }
      },
      responseStatus: error.response?.status ?? null,
      responseData: error.response?.data ?? null,
      responseHeaders: error.response?.headers ?? null
    });
    throw error;
  }

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
 * Sprint 11.3 — Exchange OAuth code for platform connection; WhatsApp optional until configured.
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

  const platformIdentity = await discoverPlatformIdentity(accessToken);
  let whatsappStatus = "pending";
  let savedWhatsApp = null;

  const assets = await tryResolveWhatsAppAssets({
    accessToken,
    wabaId: input.wabaId || null,
    phoneNumberId: input.phoneNumberId || null
  });

  if (assets?.wabaId && assets?.phoneNumberId) {
    try {
      savedWhatsApp = await saveWhatsAppConnectionFromAssets({
        accessToken,
        assets,
        onboardingType: input.onboardingType || "whatsapp_business_app"
      });
      whatsappStatus = "connected";
      metaLogger.info("meta_channel_connected", { channel: "whatsapp" });
    } catch (error) {
      logCompletionStageFailure(error.stage || COMPLETION_STAGES.SUBSCRIBE_FAILED, {
        wabaId: assets.wabaId,
        message: error.response?.data?.error?.message || error.message
      });

      if (error.stage === COMPLETION_STAGES.SUBSCRIBE_FAILED || error.stage === COMPLETION_STAGES.SAVE_FAILED) {
        metaLogger.warn("whatsapp_connection_deferred", {
          message: error.message
        });
      } else {
        throw error;
      }
    }
  } else {
    metaLogger.info("meta_channel_pending", { channel: "whatsapp" });
  }

  try {
    await platformRepository.savePlatformConnection({
      access_token: accessToken,
      facebook_user_id: platformIdentity.userId,
      facebook_user_name: platformIdentity.userName,
      messenger_page_id: platformIdentity.pageId,
      facebook_status: "connected",
      messenger_status: "connected",
      whatsapp_status: whatsappStatus
    });
  } catch (error) {
    logCompletionStageFailure(COMPLETION_STAGES.SAVE_FAILED, {
      message: error.message
    });
    throw createCompletionStageError(COMPLETION_STAGES.SAVE_FAILED, error);
  }

  markAuthorizationCodeUsed(code);

  metaLogger.info("meta_channel_connected", { channel: "facebook" });
  metaLogger.info("meta_channel_connected", { channel: "messenger" });
  metaLogger.info("embedded_signup_exchange_completed", {
    whatsappStatus,
    wabaId: savedWhatsApp?.waba_id || null,
    phoneNumberId: savedWhatsApp?.phone_number_id || null
  });

  return {
    success: true,
    channels: buildChannelStatus(whatsappStatus),
    platform: toSafePlatformConnection(await platformRepository.getPlatformConnection()),
    connection: savedWhatsApp ? toSafeConnection(savedWhatsApp) : null
  };
}

/**
 * Sprint 11.3 — Attach WhatsApp assets after platform OAuth when FINISH arrives late.
 * @param {{ wabaId: string, phoneNumberId: string, onboardingType?: string }} input
 */
async function attachWhatsAppFromEmbeddedSignup(input) {
  const wabaId = String(input.wabaId || "").trim();
  const phoneNumberId = String(input.phoneNumberId || "").trim();

  if (!wabaId || !phoneNumberId) {
    throw Object.assign(new Error("WhatsApp Business assets are required."), {
      statusCode: 400,
      publicCode: "WHATSAPP_ASSETS_REQUIRED"
    });
  }

  const accessToken = await platformRepository.getDecryptedAccessToken();

  if (!accessToken) {
    throw Object.assign(new Error("Meta platform connection is not available."), {
      statusCode: 409,
      publicCode: "PLATFORM_CONNECTION_REQUIRED"
    });
  }

  let assets;

  try {
    assets = await resolveConnectionAssets({
      accessToken,
      wabaId,
      phoneNumberId
    });
  } catch (error) {
    logCompletionStageFailure(COMPLETION_STAGES.ASSET_DISCOVERY_FAILED, {
      message: error.message
    });
    throw createCompletionStageError(COMPLETION_STAGES.ASSET_DISCOVERY_FAILED, error);
  }

  let saved;

  try {
    saved = await saveWhatsAppConnectionFromAssets({
      accessToken,
      assets,
      onboardingType: input.onboardingType || "whatsapp_business_app"
    });
  } catch (error) {
    logCompletionStageFailure(error.stage || COMPLETION_STAGES.SUBSCRIBE_FAILED, {
      wabaId: assets.wabaId,
      message: error.response?.data?.error?.message || error.message
    });
    throw createCompletionStageError(error.stage || COMPLETION_STAGES.SUBSCRIBE_FAILED, error);
  }

  await platformRepository.updatePlatformConnection({
    whatsapp_status: "connected"
  });

  metaLogger.info("meta_channel_connected", { channel: "whatsapp" });

  return {
    success: true,
    channels: buildChannelStatus("connected"),
    connection: toSafeConnection(saved)
  };
}

async function getEmbeddedSignupStatus() {
  const whatsappStatus = await getCachedConnectionStatus();
  const platform = toSafePlatformConnection(await platformRepository.getPlatformConnection());

  return {
    ...whatsappStatus,
    platform,
    channels: platform
      ? {
          facebook: platform.facebookStatus,
          messenger: platform.messengerStatus,
          whatsapp: platform.whatsappStatus
        }
      : null
  };
}

module.exports = {
  COMPLETION_STAGES,
  completeEmbeddedSignupExchange,
  attachWhatsAppFromEmbeddedSignup,
  getEmbeddedSignupStatus,
  sanitizeMetaError,
  exchangeAuthorizationCodeForToken,
  resolveConnectionAssets,
  subscribeWabaToApp
};
