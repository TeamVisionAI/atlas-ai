/**
 * @typedef {Object} OrganizationOfficeSettings
 * @property {string} name
 * @property {string} street
 * @property {string} suite
 * @property {string} city
 * @property {string} state
 * @property {string} zip
 * @property {string} fullAddress
 * @property {string | null} mapsUrl
 */

/**
 * @typedef {Object} OrganizationSettings
 * @property {string | null} zoomInterviewUrl
 * @property {OrganizationOfficeSettings} office
 * @property {Object | null} businessHours
 * @property {Record<string, string>} templates
 */

export {};
