/**
 * Journey #7 — Zoom Server-to-Server OAuth token management.
 */

const { executeWithRetry } = require("../shared/RetryPolicy");

let cachedAccessToken = null;
let tokenExpiresAt = 0;

function isZoomConfigured() {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
      process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET
  );
}

class ZoomOAuthConnector {
  constructor() {
    this.connectorId = "zoom-oauth";
  }

  isConfigured() {
    return isZoomConfigured();
  }

  async fetchAccessToken() {
    if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
      return cachedAccessToken;
    }

    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const { result } = await executeWithRetry(async () => {
      const response = await fetch(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`
          }
        }
      );

      if (!response.ok) {
        const error = new Error(`Zoom OAuth failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    });

    cachedAccessToken = result.access_token;
    tokenExpiresAt = Date.now() + (result.expires_in || 3600) * 1000;
    return cachedAccessToken;
  }

  resetCache() {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
  }
}

module.exports = {
  ZoomOAuthConnector,
  isZoomConfigured
};
