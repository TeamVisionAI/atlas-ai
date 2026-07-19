/**
 * Sprint 6.1 — Live health checks for stored Meta WhatsApp connection.
 */

const axios = require("axios");
const { repository, toSafeConnection } = require("../../repositories/metaWhatsAppConnectionRepository");
const { metaLogger } = require("./metaLogger");
const { getReconnectFlowPlan } = require("./metaReconnectFlow");

function getGraphVersion() {
  return process.env.META_GRAPH_API_VERSION || "v21.0";
}

function buildHealthResult(base) {
  return {
    checkedAt: new Date().toISOString(),
    reconnectFlow: getReconnectFlowPlan(),
    ...base
  };
}

async function verifyPhoneNumber(phoneNumberId, accessToken) {
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

async function verifyWabaSubscription(wabaId, accessToken) {
  const version = getGraphVersion();

  const response = await axios.get(
    `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
    {
      params: { access_token: accessToken },
      timeout: 15000
    }
  );

  const apps = response.data?.data || [];

  return {
    subscribed: apps.length > 0,
    appCount: apps.length
  };
}

/**
 * @param {{ persist?: boolean }} [options]
 */
async function checkMetaConnectionHealth(options = {}) {
  const connection = await repository.getConnection();

  if (!connection) {
    return buildHealthResult({
      status: "disconnected",
      healthy: false,
      connection: null,
      checks: {
        repository: "missing"
      },
      message: "No WhatsApp Business App connection stored."
    });
  }

  const accessToken = await repository.getDecryptedAccessToken();

  if (!accessToken) {
    return buildHealthResult({
      status: "error",
      healthy: false,
      connection: toSafeConnection(connection),
      checks: {
        token: "missing"
      },
      message: "Stored connection is missing a usable access token."
    });
  }

  try {
    const phone = await verifyPhoneNumber(connection.phone_number_id, accessToken);
    const subscription = await verifyWabaSubscription(connection.waba_id, accessToken);

    const healthy = Boolean(phone?.id && subscription.subscribed);
    const status = healthy ? "healthy" : "degraded";

    if (options.persist !== false) {
      await repository.updateConnection({
        last_health_status: status,
        last_health_checked_at: new Date().toISOString(),
        display_phone_number: phone.display_phone_number || connection.display_phone_number,
        verified_name: phone.verified_name || connection.verified_name
      });
    }

    metaLogger.info("connection_health_checked", {
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      status,
      subscribed: subscription.subscribed
    });

    return buildHealthResult({
      status,
      healthy,
      connection: toSafeConnection({
        ...connection,
        last_health_status: status,
        last_health_checked_at: new Date().toISOString(),
        display_phone_number: phone.display_phone_number || connection.display_phone_number,
        verified_name: phone.verified_name || connection.verified_name
      }),
      checks: {
        phoneNumberReachable: Boolean(phone?.id),
        wabaSubscribed: subscription.subscribed,
        subscribedAppCount: subscription.appCount
      },
      message: healthy
        ? "WhatsApp Business App connection is healthy."
        : "Connection stored but Meta health checks reported degradation."
    });
  } catch (error) {
    metaLogger.error("connection_health_failed", {
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      message: error.response?.data?.error?.message || error.message
    });

    const status = "unhealthy";

    if (options.persist !== false) {
      await repository.updateConnection({
        last_health_status: status,
        last_health_checked_at: new Date().toISOString()
      });
    }

    return buildHealthResult({
      status,
      healthy: false,
      connection: toSafeConnection({
        ...connection,
        last_health_status: status,
        last_health_checked_at: new Date().toISOString()
      }),
      checks: {
        phoneNumberReachable: false,
        wabaSubscribed: false
      },
      message: "Unable to verify WhatsApp connection with Meta."
    });
  }
}

async function getCachedConnectionStatus() {
  const connection = await repository.getConnection();

  return {
    connected: Boolean(connection && connection.status === "connected"),
    connection: toSafeConnection(connection),
    storageKind: repository.getStorageKind()
  };
}

module.exports = {
  checkMetaConnectionHealth,
  getCachedConnectionStatus
};
