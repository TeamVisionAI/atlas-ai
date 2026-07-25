/**
 * Sprint 16.9 — Organization branding from database.
 */

const { supabase } = require("./supabaseService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

async function getOrganizationBranding(organizationId = DEFAULT_ORGANIZATION_ID) {
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, logo_url, primary_color, secondary_color, website, timezone, is_active"
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    logoUrl: data.logo_url,
    primaryColor: data.primary_color || "#1a365d",
    secondaryColor: data.secondary_color || "#2b6cb0",
    website: data.website,
    timezone: data.timezone || "America/New_York",
    isActive: data.is_active !== false
  };
}

module.exports = {
  getOrganizationBranding
};
