/**
 * Journey #7 — Google OAuth token management for Calendar connector.
 */

const { google } = require("googleapis");
const jsonOrganizationRepository = require("../../repositories/jsonOrganizationRepository");

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/onboarding/calendar/callback";

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

class GoogleOAuthConnector {
  constructor() {
    this.connectorId = "google-oauth";
  }

  isConfigured() {
    return Boolean(getOAuthClient());
  }

  async resolveRefreshToken(organizationId) {
    if (!organizationId) {
      return process.env.GOOGLE_REFRESH_TOKEN || null;
    }

    const organization = await jsonOrganizationRepository.findById(organizationId);
    return (
      organization?.settings?.calendar_refresh_token_encrypted ||
      process.env.GOOGLE_REFRESH_TOKEN ||
      null
    );
  }

  /**
   * @param {string|null} organizationId
   * @returns {Promise<Object|null>}
   */
  async getAuthorizedClient(organizationId = null) {
    const oauth2Client = getOAuthClient();
    const refreshToken = await this.resolveRefreshToken(organizationId);

    if (!oauth2Client || !refreshToken) {
      return null;
    }

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }
}

module.exports = {
  GoogleOAuthConnector
};
