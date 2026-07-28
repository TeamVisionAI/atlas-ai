/**
 * Sprint 20.1 — Live health checks for org-scoped WhatsApp integration.
 */

const axios = require("axios");
const { repository, toSafeConnection } = require("../../repositories/metaWhatsAppConnectionRepository");
const { metaLogger } = require("./metaLogger");
const { getReconnectFlowPlan } = require("./metaReconnectFlow");
const { getMetaGraphApiVersion } = require("./metaGraphApiVersion");

function getGraphVersion() {
  return getMetaGraphApiVersion();
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
 * @param {string} organizationId
 * @param {{ persist?: boolean }} [options]
 */
async function checkMetaConnectionHealth(organizationId, options = {}) {
  const connection = await repository.getConnection(organizationId);

  if (!connection || connection.status !== "connected") {
    return buildHealthResult({
      status: "disconnected",
      healthy: false,
      connection: toSafeConnection(connection),
      checks: {
        repository: connection ? "not_connected" : "missing"
      },
      message: "No connected WhatsApp Business account for this organization."
    });
  }

  const accessToken = await repository.getDecryptedAccessToken(organizationId);

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
    const now = new Date().toISOString();

    if (options.persist !== false) {
      await repository.updateConnection(organizationId, {
        last_health_status: status,
        last_health_checked_at: now,
        display_phone_number: phone.display_phone_number || connection.display_phone_number,
        business_name: phone.verified_name || connection.business_name
      });
    }

    metaLogger.info("connection_health_checked", {
      organizationId,
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
        last_health_checked_at: now,
        display_phone_number: phone.display_phone_number || connection.display_phone_number,
        business_name: phone.verified_name || connection.business_name
      }),
      checks: {
        phoneNumberReachable: Boolean(phone?.id),
        wabaSubscribed: subscription.subscribed,
        subscribedAppCount: subscription.appCount
      },
      message: healthy
        ? "WhatsApp Business connection is healthy."
        : "Connection stored but Meta health checks reported degradation."
    });
  } catch (error) {
    metaLogger.error("connection_health_failed", {
      organizationId,
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      message: error.response?.data?.error?.message || error.message
    });

    const status = "unhealthy";
    const now = new Date().toISOString();

    if (options.persist !== false) {
      await repository.updateConnection(organizationId, {
        last_health_status: status,
        last_health_checked_at: now
      });
    }

    return buildHealthResult({
      status,
      healthy: false,
      connection: toSafeConnection({
        ...connection,
        last_health_status: status,
        last_health_checked_at: now
      }),
      checks: {
        phoneNumberReachable: false,
        wabaSubscribed: false
      },
      message: "Unable to verify WhatsApp connection with Meta."
    });
  }
}

async function getCachedConnectionStatus(organizationId) {
  const connection = await repository.getConnection(organizationId);

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
