/**
 * Curated QR campaign types (UI allowlist). DB stores free text campaign_type.
 */

const CAMPAIGN_TYPES = Object.freeze([
  { value: "car_magnet", label: "Car Magnet" },
  { value: "business_card", label: "Business Card" },
  { value: "recruiting_flyer", label: "Recruiting Flyer" },
  { value: "office_poster", label: "Office Poster" },
  { value: "career_fair", label: "Career Fair" },
  { value: "event", label: "Event" },
  { value: "social_digital", label: "Social / Digital" },
  { value: "custom", label: "Custom" }
]);

const CAMPAIGN_TYPE_VALUES = Object.freeze(CAMPAIGN_TYPES.map((t) => t.value));

function isAllowedCampaignType(value) {
  return CAMPAIGN_TYPE_VALUES.includes(String(value || "").trim());
}

function labelForCampaignType(value) {
  const found = CAMPAIGN_TYPES.find((t) => t.value === value);
  return found ? found.label : value || "Custom";
}

/** Attribution source label — mirrors type for new manager campaigns. */
function sourceForCampaignType(value) {
  const v = String(value || "").trim();
  return isAllowedCampaignType(v) ? v : "custom";
}

module.exports = {
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_VALUES,
  isAllowedCampaignType,
  labelForCampaignType,
  sourceForCampaignType
};
